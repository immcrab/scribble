import { WorkerClientError } from "./workerClient";

/** One entry from xKiro's GET /v1/audio/voices, proxied by the Worker. */
export interface Voice {
  id: string;
  name: string;
  locale: string | null;
  languageKey: string | null;
  gender: string | null;
  isVip: boolean;
  categories: string[];
}

interface VoicesResponse {
  total?: number;
  returned?: number;
  voices?: Voice[];
}

/** Audio containers xKiro's /v1/audio/speech accepts. */
export const SPEECH_FORMATS = ["mp3", "wav", "opus", "aac", "flac"] as const;
export type SpeechFormat = (typeof SPEECH_FORMATS)[number];

const FORMAT_EXT: Record<string, string> = {
  mp3: "mp3",
  wav: "wav",
  opus: "opus",
  aac: "aac",
  flac: "flac",
};

export function speechFileName(format: string | undefined): string {
  return `speech.${FORMAT_EXT[format ?? "mp3"] ?? "mp3"}`;
}

export function speechMimeType(format: string | undefined): string {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/opus";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    default:
      return "audio/mpeg";
  }
}

function base(workerUrl: string): string {
  if (!workerUrl) {
    throw new WorkerClientError("No Worker URL configured. Open Settings and paste your Cloudflare Worker URL.");
  }
  return workerUrl.replace(/\/$/, "");
}

/** Fetch the full voice catalogue (xKiro caches it five minutes upstream). */
export async function listVoices({
  workerUrl,
  password,
}: {
  workerUrl: string;
  password?: string;
}): Promise<Voice[]> {
  const res = await fetch(`${base(workerUrl)}/api/speech/voices`, {
    headers: { ...(password ? { "X-Scribble-Password": password } : {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new WorkerClientError((body as { error?: string } | null)?.error || `Loading voices failed (${res.status})`);
  }
  const json = (await res.json()) as VoicesResponse;
  return Array.isArray(json.voices) ? json.voices : [];
}

/** Best-effort playback length (seconds) of a generated audio data URL — used for usage
 * billing. Resolves 0 if the browser can't read the metadata. */
export function audioDurationSeconds(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const a = new Audio();
      a.preload = "metadata";
      const done = (v: number) => resolve(Number.isFinite(v) && v > 0 ? v : 0);
      a.onloadedmetadata = () => done(a.duration);
      a.onerror = () => done(0);
      a.src = dataUrl;
    } catch {
      resolve(0);
    }
  });
}

/** POST a text block to the Worker's xKiro TTS proxy; returns a data: URL for the audio. */
export async function generateSpeech({
  workerUrl,
  password,
  input,
  voice,
  format,
  speed,
  signal,
}: {
  workerUrl: string;
  password?: string;
  input: string;
  voice: string;
  format?: string;
  speed?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch(`${base(workerUrl)}/api/speech/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(password ? { "X-Scribble-Password": password } : {}),
    },
    body: JSON.stringify({
      input,
      voice,
      ...(format ? { format } : {}),
      ...(typeof speed === "number" ? { speed } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new WorkerClientError((body as { error?: string } | null)?.error || `Speech generation failed (${res.status})`);
  }

  const json = (await res.json()) as { dataUrl?: string };
  if (!json.dataUrl) {
    throw new WorkerClientError("Worker response had no audio.");
  }
  return json.dataUrl;
}
