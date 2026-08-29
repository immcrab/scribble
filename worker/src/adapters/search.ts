export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
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
 * a web search would just burn SerpApi quota confirming a fact we were handed for free. */
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
 * SerpApi. The message as typed is often a poor query — it carries conversational
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
            "You write web-search queries. Given the conversation and the user's latest message, work out what fact they actually need, then output the search query a skilled researcher would type into Google to find it. Resolve pronouns and references using the conversation. Strip conversational filler, first-person framing, and politeness. Prefer specific keywords, names, and dates over full sentences. Add a year or 'latest' when recency matters. Output only the query text — no quotes, no explanation.",
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

/** SerpApi (Google engine) — https://serpapi.com/search-api */
export async function searchWeb(apiKey: string, query: string): Promise<SearchResult[]> {
  const url = `https://serpapi.com/search.json?engine=google&num=5&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SerpApi error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
    error?: string;
  };
  if (json.error) throw new Error(json.error);

  return (json.organic_results ?? [])
    .slice(0, 5)
    .map((r) => ({ title: r.title || "", link: r.link || "", snippet: r.snippet || "" }))
    .filter((r) => r.title && r.link);
}
