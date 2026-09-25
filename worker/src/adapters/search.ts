export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  thumbnailUrl?: string;
  faviconUrl?: string;
}

/** A small, free favicon endpoint for providers that return result links but
 * not icons themselves. Only the destination hostname is sent to it. */
function fallbackFavicon(url: string): string | undefined {
  try {
    return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(new URL(url).hostname)}.ico`;
  } catch {
    return undefined;
  }
}

/** A user should not have to depend on a classifier recognising that they have
 * explicitly asked us to use the web.  This intentionally covers natural
 * phrasing as well as a pasted URL. */
export function explicitlyRequestsWeb(query: string): boolean {
  return (
    /\b(?:search|google|look\s*up|browse|visit|open|check|use)\b[\s\S]{0,80}\b(?:the\s+)?(?:web|internet|site|website|webpage|page)\b/i.test(query) ||
    /\b(?:search|google|look\s*up)\b[\s\S]{0,80}\b(?:for|about)\b/i.test(query) ||
    /\b(?:can|could|will)\s+you\s+(?:browse|search|visit|open|check|use)\b/i.test(query) ||
    /https?:\/\/[^\s]+/i.test(query)
  );
}

/** Returns the first public http(s) URL in a message, if it is safe for the
 * Worker to retrieve. This is intentionally conservative: a chat prompt must
 * never turn into a request to a local/private network address. */
export function publicUrlIn(query: string): string | undefined {
  const raw = query.match(/https?:\/\/[^\s<>"')\]]+/i)?.[0];
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const privateIpv4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (
      url.protocol !== "https:" ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      privateIpv4 ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Fetch a user-supplied public page and reduce it to readable text for the
 * model. This is deliberately small and dependency-free so it works on the
 * Worker free tier. It is not a browser: JavaScript-rendered/logged-in pages
 * can still fall back to a normal search result. */
async function readWebPageDirect(url: string): Promise<{ title: string; text: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "lofin web reader", Accept: "text/html,application/xhtml+xml,text/plain" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Website returned ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
    throw new Error("That URL is not a readable web page.");
  }
  const source = (await response.text()).slice(0, 750_000);
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? new URL(url).hostname;
  const text = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
  if (!text) throw new Error("The website did not provide readable page text.");
  return { title: title.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(), text };
}

/** Read a public page through xKiro's web-fetch API.  Unlike the lightweight
 * fallback below, xKiro returns page markdown with navigation and boilerplate
 * removed, which is a much better input for the chat model. */
async function fetchXkiroWebPage(apiKey: string, url: string): Promise<{ title: string; text: string }> {
  const res = await fetch("https://api.xkiro.com/v1/fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "xkiro/web-fetch", urls: [url], max_content_tokens: 3_000 }),
  });
  if (!res.ok) throw new Error(`xKiro web fetch error ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as {
    results?: Array<{ url?: string; title?: string | null; content?: string; error?: string | null }>;
    error?: string | { message?: string };
  };
  if (json.error) throw new Error(typeof json.error === "string" ? json.error : json.error.message || "xKiro web fetch failed.");

  const page = json.results?.[0];
  if (!page || page.error) throw new Error(page?.error || "xKiro could not fetch that page.");
  const text = page.content?.trim().slice(0, 12_000) || "";
  if (!text) throw new Error("The website did not provide readable page text.");
  return { title: page.title?.trim() || new URL(url).hostname, text };
}

/** Prefer xKiro's cleaned markdown fetch whenever its credential is available.
 * The direct reader preserves URL support if xKiro is unconfigured or has a
 * transient outage. */
export async function readWebPage(apiKey: string | undefined, url: string): Promise<{ title: string; text: string }> {
  if (apiKey) {
    try {
      return await fetchXkiroWebPage(apiKey, url);
    } catch {
      // A normal public page may still be useful even when xKiro cannot read it.
    }
  }
  return readWebPageDirect(url);
}

/** Plain arithmetic (nothing but digits/whitespace/math symbols), or a message
 * containing a long run of consecutive digits — id-like number noise that a cheap
 * classifier can misjudge as a lookup-worthy serial/tracking number even when it's
 * wrapped in filler words ("what about 7282...098x 9"). Never worth a search either
 * way, so this short-circuits before spending a Groq call to ask. */
export function looksLikeArithmetic(query: string): boolean {
  const trimmed = query.trim();
  if (/^[\d\s+\-*/x×÷.,()^%=]+$/i.test(trimmed)) return true;
  return /\d{10,}/.test(trimmed);
}

/** Same "asking about my own whereabouts" pattern the frontend uses to decide whether to
 * re-offer the location popup (frontend/src/lib/clientContext.ts). If the message matches
 * and clientContext already carries an IP-derived location, the answer's already in hand —
 * a web search would just burn quota confirming a fact we were handed for free. */
const OWN_LOCATION_RE =
  /\bwhere\s+(am\s+i|are\s+we)\b|\bmy\s+(current\s+)?location\b|\bwhat\s+city\s+am\s+i\b|\bcurrent\s+location\b|\bwhat.?s\s+my\s+location\b/i;

export function isOwnLocationAlreadyKnown(query: string, location?: string): boolean {
  return !!location && OWN_LOCATION_RE.test(query);
}

/** Same Groq model used for chat titles (adapters/title.ts) — a reasoning model, so
 * `reasoning_effort: "low"` plus a real `max_tokens` budget below are required or it
 * spends the whole budget on hidden chain-of-thought and returns empty content. */
const SEARCH_DECISION_MODEL = "openai/gpt-oss-20b";

/**
 * Fast yes/no classification of whether a user's message needs a live web
 * search to answer well (current events, prices, recent releases, anything
 * time-sensitive) versus general knowledge the model already has. Powers the
 * "auto" web-search mode — see the /api/chat/stream handler in index.ts.
 */
export async function shouldSearchWeb(apiKey: string, query: string): Promise<boolean> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: SEARCH_DECISION_MODEL,
      stream: false,
      max_tokens: 40,
      temperature: 0,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            'Decide whether answering the user\'s message well requires a live web search for a specific real-world fact. Search for: current events, prices, scores, recent releases, "today"/"latest"/"right now", anything that changes over time or postdates your training, and factual lookups about real people/places/products/statistics a memorized answer would likely get wrong or outdated. Do NOT search for: arithmetic or math of any kind — no matter how large, long, or odd-looking the numbers are, a calculation is never a web search — nor coding, writing, brainstorming, opinions, hypotheticals, or general conceptual knowledge. If the message isn\'t clearly asking about a real-world fact, the answer is no. Reply with exactly one word: "yes" or "no".',
        },
        { role: "user", content: query.slice(0, 2000) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
  // Reasoning models occasionally still burn the whole budget on hidden
  // chain-of-thought despite reasoning_effort/max_tokens headroom above —
  // treat that as inconclusive (caller fails open) rather than a silent "no".
  if (!raw) throw new Error("Groq returned no decision.");
  return raw.startsWith("y");
}

/**
 * Rewrite the user's raw message into a focused web-search query before it hits
 * xKiro. The message as typed is often a poor query — it carries conversational
 * filler ("hey can you tell me..."), first-person framing, or pronouns that only
 * resolve against earlier turns ("how tall is he?"). This asks the same cheap Groq
 * model to think about what the user actually wants to know and emit the keywords
 * a person would type into Google. `history` is the recent turns (oldest→newest,
 * excluding the current message) so references like "its sequel" / "that company"
 * get resolved. Returns a trimmed query string; callers fall back to the raw
 * message on any failure or empty result.
 */
export async function buildSearchQuery(
  apiKey: string,
  query: string,
  history: { role: string; content: string }[] = []
): Promise<string> {
  const context = history
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
    .join("\n");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: SEARCH_DECISION_MODEL,
      stream: false,
      max_tokens: 60,
      temperature: 0,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            "You write web-search queries. Given the conversation and the user's latest message, work out what fact they actually need, then output the search query a skilled researcher would type into Google to find it. Resolve pronouns and references using the conversation. Strip conversational filler, first-person framing, and politeness. Prefer specific keywords, names, and dates over full sentences. Never add names, products, dates, claims, or possible answers that the user or conversation did not supply. Output only the query text — no quotes, no explanation.",
        },
        {
          role: "user",
          content: `${context ? `Conversation so far:\n${context}\n\n` : ""}Latest message:\n${query.slice(0, 2000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim().replace(/^["'`]+|["'`]+$/g, "") ?? "";
  if (!raw) throw new Error("Groq returned no query.");
  return raw.slice(0, 300);
}

/** xKiro Web Search — https://docs.xkiro.com/api/web-search/
 *
 * Search stays server-side, so the browser never sees the credential used for
 * chat, images, or web results. A single XKIRO_API_KEY covers all three.
 */
async function searchXkiro(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.xkiro.com/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "xkiro/web-search", query, max_results: 10 }),
  });
  if (!res.ok) {
    throw new Error(`xKiro web search error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; snippet?: string; thumbnailUrl?: string | null; faviconUrl?: string | null }>;
    error?: string | { message?: string };
  };
  if (json.error) throw new Error(typeof json.error === "string" ? json.error : json.error.message || "xKiro web search failed.");

  return (json.results ?? [])
    .slice(0, 10)
    .map((r) => {
      const link = r.url || "";
      return {
        title: r.title || "",
        link,
        snippet: r.snippet || "",
        ...(r.thumbnailUrl ? { thumbnailUrl: r.thumbnailUrl } : {}),
        ...(r.faviconUrl || fallbackFavicon(link) ? { faviconUrl: r.faviconUrl || fallbackFavicon(link) } : {}),
      };
    })
    .filter((r) => r.title && r.link);
}

/**
 * Keyless fallback for chat providers other than xKiro. Bing's public RSS
 * response has a small, stable XML surface and lets a Worker retrieve ordinary
 * web results without exposing a key or charging the user. It is deliberately
 * a fallback: xKiro results include richer previews when that integration is
 * configured.
 */
async function searchBingRss(query: string): Promise<SearchResult[]> {
  const res = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`Free web search error ${res.status}.`);

  const xml = await res.text();
  const decode = (value: string) =>
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  const field = (item: string, tag: string) => {
    const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    return match ? decode(match[1]) : "";
  };

  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
    .slice(0, 10)
    .map((match) => {
      const link = field(match[1], "link");
      return { title: field(match[1], "title"), link, snippet: field(match[1], "description"), faviconUrl: fallbackFavicon(link) };
    })
    .filter((result) => result.title && /^https?:\/\//i.test(result.link));
}

/** Search without making the selected chat provider matter.  xKiro remains an
 * optional richer backend; when it is absent or temporarily unavailable, every
 * model (including Mistral Small 4) receives free live results. */
export async function searchWeb(apiKey: string | undefined, query: string): Promise<SearchResult[]> {
  if (apiKey) {
    try {
      const results = await searchXkiro(apiKey, query);
      if (results.length) return results;
    } catch {
      // The free backend below keeps search working during xKiro outages too.
    }
  }
  return searchBingRss(query);
}
