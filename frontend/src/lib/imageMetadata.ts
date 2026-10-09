/**
 * Reads EXIF metadata (GPS location, capture time, camera) straight from an
 * image File's bytes. This has to run on the ORIGINAL file: Composer re-encodes
 * images through a canvas to shrink them, which strips every EXIF tag. The
 * result is a short plain-text summary that travels with the attachment so the
 * model can answer "where/when was this taken?" — pixels alone can't tell it.
 *
 * Supports JPEG (APP1), PNG (eXIf chunk), WebP (EXIF chunk) and raw TIFF.
 * Returns undefined when the file has no useful metadata.
 */

const TAGS: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x8769: "ExifIFD",
  0x8825: "GPSIFD",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISO",
  0x9003: "DateTimeOriginal",
  0x9010: "OffsetTimeOriginal",
  0x920a: "FocalLength",
  0xa002: "PixelWidth",
  0xa003: "PixelHeight",
  0xa434: "LensModel",
  0x010e: "ImageDescription",
};

const GPS_TAGS: Record<number, string> = {
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
  0x0005: "GPSAltitudeRef",
  0x0006: "GPSAltitude",
  0x0007: "GPSTimeStamp",
  0x0010: "GPSImgDirectionRef",
  0x0011: "GPSImgDirection",
  0x001d: "GPSDateStamp",
};

type TagValue = string | number | number[];
type TagMap = Record<string, TagValue>;

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };

function readValue(view: DataView, tiff: number, entry: number, little: boolean): TagValue | undefined {
  const type = view.getUint16(entry + 2, little);
  const count = view.getUint32(entry + 4, little);
  const size = TYPE_SIZES[type];
  if (!size || count > 4096) return undefined;
  const total = size * count;
  const offset = total > 4 ? tiff + view.getUint32(entry + 8, little) : entry + 8;
  if (offset + total > view.byteLength) return undefined;

  if (type === 2) {
    let s = "";
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(offset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = offset + i * size;
    switch (type) {
      case 1: case 7: values.push(view.getUint8(p)); break;
      case 3: values.push(view.getUint16(p, little)); break;
      case 4: values.push(view.getUint32(p, little)); break;
      case 9: values.push(view.getInt32(p, little)); break;
      case 11: values.push(view.getFloat32(p, little)); break;
      case 12: values.push(view.getFloat64(p, little)); break;
      case 5: { const d = view.getUint32(p + 4, little); values.push(d ? view.getUint32(p, little) / d : 0); break; }
      case 10: { const d = view.getInt32(p + 4, little); values.push(d ? view.getInt32(p, little) / d : 0); break; }
    }
  }
  return values.length === 1 ? values[0] : values;
}

function readIfd(view: DataView, tiff: number, ifd: number, little: boolean, names: Record<number, string>, out: TagMap) {
  if (ifd + 2 > view.byteLength) return;
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const name = names[view.getUint16(entry, little)];
    if (!name) continue;
    const value = readValue(view, tiff, entry, little);
    if (value !== undefined && value !== "") out[name] = value;
  }
}

/** Parses a TIFF-structured EXIF block starting at `tiff` within `view`. */
function parseTiff(view: DataView, tiff: number): TagMap {
  const tags: TagMap = {};
  if (tiff + 8 > view.byteLength) return tags;
  const order = view.getUint16(tiff);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return tags;
  readIfd(view, tiff, tiff + view.getUint32(tiff + 4, little), little, TAGS, tags);
  if (typeof tags.ExifIFD === "number") readIfd(view, tiff, tiff + tags.ExifIFD, little, TAGS, tags);
  if (typeof tags.GPSIFD === "number") readIfd(view, tiff, tiff + tags.GPSIFD, little, GPS_TAGS, tags);
  return tags;
}

function findExif(view: DataView): number | undefined {
  const len = view.byteLength;
  // JPEG: walk segments looking for APP1 "Exif\0\0".
  if (len > 4 && view.getUint16(0) === 0xffd8) {
    let p = 2;
    while (p + 4 < len) {
      if (view.getUint8(p) !== 0xff) return undefined;
      const marker = view.getUint8(p + 1);
      const size = view.getUint16(p + 2);
      if (marker === 0xe1 && view.getUint32(p + 4) === 0x45786966) return p + 10;
      if (marker === 0xda) return undefined; // start of scan — no more metadata
      p += 2 + size;
    }
    return undefined;
  }
  // PNG: look for an eXIf chunk.
  if (len > 8 && view.getUint32(0) === 0x89504e47) {
    let p = 8;
    while (p + 8 < len) {
      const size = view.getUint32(p);
      const type = view.getUint32(p + 4);
      if (type === 0x65584966) return p + 8; // "eXIf"
      if (type === 0x49444154) return undefined; // "IDAT"
      p += 12 + size;
    }
    return undefined;
  }
  // WebP: RIFF container with an "EXIF" chunk.
  if (len > 12 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    let p = 12;
    while (p + 8 < len) {
      const type = view.getUint32(p);
      const size = view.getUint32(p + 4, true);
      if (type === 0x45584946) {
        // Some encoders keep the "Exif\0\0" prefix inside the chunk.
        return view.getUint32(p + 8) === 0x45786966 ? p + 14 : p + 8;
      }
      p += 8 + size + (size % 2);
    }
    return undefined;
  }
  // Raw TIFF.
  const order = len > 2 ? view.getUint16(0) : 0;
  if (order === 0x4949 || order === 0x4d4d) return 0;
  return undefined;
}

function toDecimal(dms: TagValue | undefined, ref: TagValue | undefined): number | undefined {
  if (!Array.isArray(dms) || dms.length < 3) return typeof dms === "number" ? dms : undefined;
  const value = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (!Number.isFinite(value)) return undefined;
  return ref === "S" || ref === "W" ? -value : value;
}

function formatExifDate(value: TagValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  // EXIF dates look like "2024:06:01 14:22:05".
  return value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
}

function summarize(tags: TagMap): string | undefined {
  const lines: string[] = [];
  const lat = toDecimal(tags.GPSLatitude, tags.GPSLatitudeRef);
  const lon = toDecimal(tags.GPSLongitude, tags.GPSLongitudeRef);
  if (lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0)) {
    const la = lat.toFixed(6);
    const lo = lon.toFixed(6);
    lines.push(`GPS location: ${la}, ${lo} (https://www.google.com/maps?q=${la},${lo})`);
    if (typeof tags.GPSAltitude === "number") {
      const below = tags.GPSAltitudeRef === 1;
      lines.push(`Altitude: ${below ? "-" : ""}${Math.round(tags.GPSAltitude)} m`);
    }
    if (typeof tags.GPSImgDirection === "number") {
      lines.push(`Camera facing: ${Math.round(tags.GPSImgDirection)}°${tags.GPSImgDirectionRef === "M" ? " (magnetic)" : ""}`);
    }
  }
  const taken = formatExifDate(tags.DateTimeOriginal) ?? formatExifDate(tags.DateTime);
  if (taken) lines.push(`Taken: ${taken}${typeof tags.OffsetTimeOriginal === "string" ? ` (UTC${tags.OffsetTimeOriginal})` : " (camera local time)"}`);
  const camera = [tags.Make, tags.Model].filter((v) => typeof v === "string").join(" ").trim();
  if (camera) lines.push(`Camera: ${camera}`);
  if (typeof tags.LensModel === "string") lines.push(`Lens: ${tags.LensModel}`);
  const exposure: string[] = [];
  if (typeof tags.FNumber === "number") exposure.push(`f/${tags.FNumber.toFixed(1)}`);
  if (typeof tags.ExposureTime === "number" && tags.ExposureTime > 0) {
    exposure.push(tags.ExposureTime >= 1 ? `${tags.ExposureTime}s` : `1/${Math.round(1 / tags.ExposureTime)}s`);
  }
  if (typeof tags.ISO === "number") exposure.push(`ISO ${tags.ISO}`);
  if (typeof tags.FocalLength === "number") exposure.push(`${Math.round(tags.FocalLength)}mm`);
  if (exposure.length) lines.push(`Exposure: ${exposure.join(", ")}`);
  if (typeof tags.PixelWidth === "number" && typeof tags.PixelHeight === "number") {
    lines.push(`Original size: ${tags.PixelWidth}×${tags.PixelHeight}`);
  }
  if (typeof tags.Software === "string") lines.push(`Software: ${tags.Software}`);
  if (typeof tags.ImageDescription === "string") lines.push(`Description: ${tags.ImageDescription}`);
  if (typeof tags.Artist === "string") lines.push(`Artist: ${tags.Artist}`);
  if (typeof tags.Copyright === "string") lines.push(`Copyright: ${tags.Copyright}`);
  return lines.length ? lines.join("\n").slice(0, 1500) : undefined;
}

export async function readImageMetadata(file: Blob): Promise<string | undefined> {
  try {
    // EXIF lives near the start of the file; 512KB covers it with plenty of room.
    const buffer = await file.slice(0, 512 * 1024).arrayBuffer();
    const view = new DataView(buffer);
    const tiff = findExif(view);
    if (tiff === undefined) return undefined;
    return summarize(parseTiff(view, tiff));
  } catch {
    return undefined;
  }
}

/** True when a metadata summary includes GPS coordinates. */
export function hasGpsMetadata(metadata?: string): boolean {
  return !!metadata?.startsWith("GPS location:");
}
