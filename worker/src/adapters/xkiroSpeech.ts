/**
 * xKiro text-to-speech — https://docs.xkiro.com/models/audio/
 *
 * POST /v1/audio/speech streams raw audio bytes back (no JSON envelope). We
 * buffer the whole response here and hand the caller a base64 data: URL — the
 * same shape adapters/xkiroImage.ts returns for images — so the frontend stores
 * generated audio as just another message attachment.
 *
 * GET /v1/audio/voices is public (no API key) and cached five minutes on
 * xKiro's end; we proxy it so the browser doesn't have to hit api.xkiro.com
 * cross-origin.
 */
const XKIRO_SPEECH_URL = "https://api.xkiro.com/v1/audio/speech";
const XKIRO_VOICES_URL = "https://api.xkiro.com/v1/audio/voices";
const SPEECH_MODEL = "xkiro-voice";

const FORMAT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/pcm",
};

export async function generateXkiroSpeech({
  apiKey,
  input,
  voice,
  format,
  speed,
}: {
  apiKey: string;
  input: string;
  voice: string;
  format?: string;
  speed?: number;
}): Promise<{ dataUrl: string }> {
  const responseFormat = format && FORMAT_MIME[format] ? format : "mp3";

  const res = await fetch(XKIRO_SPEECH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      input,
      voice,
      response_format: responseFormat,
      ...(typeof speed === "number" ? { speed } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`xKiro speech error ${res.status}: ${await res.text()}`);
  }

  const mime = res.headers.get("Content-Type")?.split(";")[0] || FORMAT_MIME[responseFormat] || "audio/mpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("xKiro speech API returned an empty audio response.");
  }

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { dataUrl: `data:${mime};base64,${btoa(binary)}` };
}

/** Proxy GET /v1/audio/voices, passing through any query filters (q, gender, locale, …). */
export async function listXkiroVoices(query: string): Promise<unknown> {
  const url = query ? `${XKIRO_VOICES_URL}?${query}` : XKIRO_VOICES_URL;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`xKiro voices error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
