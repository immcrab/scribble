export interface FoundImage {
  /** Full-size (or large) image URL. */
  url: string;
  /** Small preview URL for the grid. */
  thumbnail: string;
  title: string;
  /** Page the image came from, for credit and "open source". */
  source: string;
  creator?: string;
  license?: string;
  width?: number;
  height?: number;
}

const PHOTO_WORDS = String.raw`(?:images?|pictures?|pics?|photos?|photographs?|wallpapers?)`;
// Asking Lofin to make an image goes to Image mode, not a search.
const GENERATE_RE = /\b(?:generate|create|make|draw|paint|sketch|design|render|imagine|edit|turn\s+(?:this|it|me))\b/i;
// "What's in this picture" / "describe the photo I attached" is about an image the user already has.
const OWN_IMAGE_RE = new RegExp(String.raw`\b(?:this|that|these|those|the|my|attached|uploaded)\s+${PHOTO_WORDS}\b`, "i");
// Image search is open to students, so explicit requests are not searched at all.
const UNSAFE_RE = /\b(?:nude|nudes|naked|nsfw|porn\w*|sex\w*|hentai|xxx|boobs?|tits?|gore|explicit|onlyfans|lingerie|topless)\b/i;

/** True when the message asks Lofin to find / show existing images of something,
 * e.g. "find me pictures of red pandas" or "show me images of the Eiffel Tower". */
export function wantsImageSearch(query: string): boolean {
  if (GENERATE_RE.test(query) || OWN_IMAGE_RE.test(query)) return false;
  return (
    new RegExp(String.raw`\b(?:find|search(?:\s+for)?|show|get|give|pull\s*up|look\s*up|send|fetch|google)\b[\s\S]{0,40}\b${PHOTO_WORDS}\b`, "i").test(query) ||
    new RegExp(String.raw`^\s*(?:(?:some|any|a\s+few)\s+)?${PHOTO_WORDS}\s+(?:of|for|about|showing)\b`, "i").test(query) ||
    (new RegExp(String.raw`\b(?:what\s+does|what\s+do)\b[\s\S]{0,60}\blook\s+like\b`, "i").test(query) && /\b(?:show|picture|image|photo|pic)\b/i.test(query))
  );
}

export function isUnsafeImageQuery(query: string): boolean {
  return UNSAFE_RE.test(query);
}

/** Reduce a conversational request to bare search keywords when no helper model is available. */
export function plainImageQuery(query: string): string {
  return query
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/\b(?:hey\s+)?lofin\b[,:]?/gi, " ")
    .replace(/\b(?:please|can you|could you|would you|will you|i want to|i'd like to|i want|i need|help me|let me)\b/gi, " ")
    .replace(/\b(?:find|search(?:\s+for)?|show(?:\s+me)?|get|give(?:\s+me)?|pull\s*up|look\s*up|send(?:\s+me)?|fetch|google)\b/gi, " ")
    .replace(new RegExp(String.raw`\b(?:an?\s+|some\s+|any\s+|a\s+few\s+)?${PHOTO_WORDS}\s+(?:of|for|about|showing)\b|\b${PHOTO_WORDS}\b`, "gi"), " ")
    .replace(/\b(?:what\s+does|what\s+do)\b|\blooks?\s+like\b/gi, " ")
    .replace(/\b(?:me|some|any|a few|an?)\b/gi, " ")
    .replace(/[?!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

const httpsUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
};

const stripHtml = (value: unknown) =>
  typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";

interface OpenverseResult {
  title?: string;
  url?: string;
  thumbnail?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  foreign_landing_url?: string;
  width?: number;
  height?: number;
}

/** Openverse: keyless, openly licensed images (Flickr, museums, Wikimedia…) with
 * mature-flagged results excluded by default. */
async function searchOpenverse(query: string, limit: number): Promise<FoundImage[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("mature", "false");
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Lofin/1.0 (image search)" } });
  if (!res.ok) throw new Error(`Openverse error ${res.status}.`);
  const json = (await res.json()) as { results?: OpenverseResult[] };
  const images: FoundImage[] = [];
  for (const r of json.results ?? []) {
    const full = httpsUrl(r.url);
    const thumb = httpsUrl(r.thumbnail) ?? full;
    if (!full || !thumb) continue;
    images.push({
      url: full,
      thumbnail: thumb,
      title: r.title?.trim() || query,
      source: httpsUrl(r.foreign_landing_url) ?? full,
      creator: r.creator?.trim() || undefined,
      license: r.license ? `CC ${r.license.toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`.replace("CC CC0", "CC0").replace("CC PDM", "Public domain") : undefined,
      width: r.width,
      height: r.height,
    });
  }
  return images;
}

interface CommonsPage {
  index?: number;
  title?: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    responsiveUrls?: Record<string, string>;
    descriptionurl?: string;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

/** Wikimedia Commons: keyless fallback when Openverse is rate-limited or empty. */
async function searchCommons(query: string, limit: number): Promise<FoundImage[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "480",
    iiextmetadatafilter: "ObjectName|Artist|LicenseShortName",
  }).toString();
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Lofin/1.0 (image search)" } });
  if (!res.ok) throw new Error(`Wikimedia Commons error ${res.status}.`);
  const json = (await res.json()) as { query?: { pages?: CommonsPage[] } };
  return (json.query?.pages ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((page): FoundImage[] => {
      const info = page.imageinfo?.[0];
      // Originals can be many megabytes; the 2x thumbnail is plenty for the chat viewer.
      const full = httpsUrl(info?.responsiveUrls?.["2"]) ?? httpsUrl(info?.url);
      const thumb = httpsUrl(info?.thumburl) ?? full;
      if (!info || !full || !thumb || !info.mime?.startsWith("image/")) return [];
      const meta = info.extmetadata ?? {};
      return [
        {
          url: full,
          thumbnail: thumb,
          title: stripHtml(meta.ObjectName?.value) || (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
          source: httpsUrl(info.descriptionurl) ?? full,
          creator: stripHtml(meta.Artist?.value).slice(0, 80) || undefined,
          license: stripHtml(meta.LicenseShortName?.value) || undefined,
          width: info.width,
          height: info.height,
        },
      ];
    });
}

/** Find existing images for a query. Tries Openverse first and falls back to Wikimedia
 * Commons; throws when neither returns anything so the caller can report a failed search. */
export async function searchImages(query: string, limit = 12): Promise<FoundImage[]> {
  let images: FoundImage[] = [];
  try {
    images = await searchOpenverse(query, limit);
  } catch {
    images = [];
  }
  if (images.length < 4) {
    try {
      const more = await searchCommons(query, limit);
      const seen = new Set(images.map((i) => i.url));
      images = [...images, ...more.filter((i) => !seen.has(i.url))].slice(0, limit);
    } catch {
      // keep whatever Openverse gave
    }
  }
  if (!images.length) throw new Error("No images found.");
  return images;
}
