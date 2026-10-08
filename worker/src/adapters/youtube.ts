export interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  duration?: string;
  views?: string;
  published?: string;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);

/** Video id from a youtube.com / youtu.be link, if the text contains one. */
export function youtubeVideoIdIn(text: string): string | undefined {
  for (const raw of text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []) {
    try {
      const url = new URL(raw);
      if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) continue;
      const id = url.hostname.toLowerCase().endsWith("youtu.be")
        ? url.pathname.split("/")[1]
        : url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
      if (id && VIDEO_ID_RE.test(id)) return id;
    } catch {
      // not a URL — keep looking
    }
  }
  return undefined;
}

/** True when the message is asking to find/watch videos — either by naming YouTube
 * or by asking for videos/tutorials to watch — or asks for videos related to a pasted
 * YouTube link. A bare pasted link ("summarize this video") is not a search request. */
export function wantsYouTubeVideos(query: string): boolean {
  if (youtubeVideoIdIn(query)) {
    return /\b(?:related|similar|more|other|like\s+(?:this|that|it))\b[\s\S]{0,40}\b(?:videos?|vids?|clips?|tutorials?)\b/i.test(query) ||
      /\b(?:videos?|vids?|clips?|tutorials?)\b[\s\S]{0,30}\b(?:like|similar\s+to|related\s+to)\b/i.test(query);
  }
  return (
    /\byoutube\b|\byt\s+(?:video|search)/i.test(query) ||
    /\b(?:find|search|show|get|give|recommend|suggest|look\s*up|pull\s*up|any|some)\b[\s\S]{0,60}\b(?:videos?|vids?|tutorials?|clips?)\b/i.test(query) ||
    (/\b(?:video|vid|tutorial)s?\b[\s\S]{0,30}\b(?:about|on|for|of)\b/i.test(query) && /\b(?:watch|find|show|search|recommend)\b/i.test(query))
  );
}

/** Reduce a conversational request to bare search keywords when no helper model is available. */
export function plainYouTubeQuery(query: string): string {
  return query
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/\b(?:please|can you|could you|would you|will you|i want to|i'd like to|i need|help me|let me)\b/gi, " ")
    .replace(/\b(?:find|search(?:\s+for)?|show(?:\s+me)?|get|give(?:\s+me)?|recommend|suggest|look\s*up|pull\s*up|watch)\b/gi, " ")
    .replace(/\b(?:on|in|from|via|using)\s+youtube\b|\byoutube\b/gi, " ")
    .replace(/\b(?:me|some|any|a few|related|similar)\b/gi, " ")
    .replace(/[?!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Title of a specific video (no API key needed), used to find related videos for a pasted link. */
export async function youtubeTitle(videoId: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`);
    if (!res.ok) return undefined;
    const json = (await res.json()) as { title?: string };
    return json.title?.trim() || undefined;
  } catch {
    return undefined;
  }
}

type Text = { simpleText?: string; runs?: Array<{ text?: string }> };
const textOf = (t?: Text) => t?.simpleText ?? t?.runs?.map((r) => r.text ?? "").join("") ?? "";

interface VideoRenderer {
  videoId?: string;
  title?: Text;
  ownerText?: Text;
  longBylineText?: Text;
  lengthText?: Text;
  viewCountText?: Text;
  publishedTimeText?: Text;
}

/** Keyless YouTube search: read the results page's embedded `ytInitialData`. Only
 * ordinary videos are kept (no ads, shorts shelves, channels, playlists or live streams
 * without a length). Throws when YouTube returns nothing parseable so the caller can
 * report a failed search instead of an empty one. */
export async function searchYouTube(query: string, limit = 8): Promise<YouTubeVideo[]> {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      // Skips the EU consent interstitial, which has no results in it.
      Cookie: "CONSENT=YES+1; SOCS=CAI",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`YouTube search error ${res.status}.`);

  const html = await res.text();
  const start = html.indexOf("ytInitialData = ");
  const end = start < 0 ? -1 : html.indexOf(";</script>", start);
  if (start < 0 || end < 0) throw new Error("YouTube did not return search results.");

  let data: unknown;
  try {
    data = JSON.parse(html.slice(start + "ytInitialData = ".length, end));
  } catch {
    throw new Error("YouTube returned results in an unexpected format.");
  }

  const seen = new Set<string>();
  const videos: YouTubeVideo[] = [];
  const walk = (node: unknown) => {
    if (videos.length >= limit || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const record = node as Record<string, unknown>;
    const v = record.videoRenderer as VideoRenderer | undefined;
    if (v?.videoId && VIDEO_ID_RE.test(v.videoId) && !seen.has(v.videoId) && v.lengthText) {
      const title = textOf(v.title).trim();
      if (title) {
        seen.add(v.videoId);
        videos.push({
          id: v.videoId,
          title,
          channel: textOf(v.ownerText ?? v.longBylineText).trim(),
          duration: textOf(v.lengthText) || undefined,
          views: textOf(v.viewCountText) || undefined,
          published: textOf(v.publishedTimeText) || undefined,
        });
      }
      return;
    }
    for (const key in record) walk(record[key]);
  };
  walk(data);

  if (!videos.length) throw new Error("No YouTube videos found.");
  return videos;
}
