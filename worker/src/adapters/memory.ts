/** Same fast Groq model used for search decisions and chat titles (adapters/search.ts,
 * adapters/title.ts) — a reasoning model, so `reasoning_effort: "low"` plus a real
 * `max_tokens` budget below are required or it spends the whole budget on hidden
 * chain-of-thought and returns empty content. */
const MEMORY_MODEL = "openai/gpt-oss-20b";

/**
 * Decides whether the user's message contains something worth remembering for future
 * conversations — either an explicit request ("remember that...", "don't forget...") or a
 * durable personal fact/preference/constraint volunteered without being asked. Powers the
 * "memory" setting's write path — see the /api/chat/stream handler in index.ts. Returns the
 * concise fact to store, or null if there's nothing worth keeping from this message.
 */
export async function extractMemory(apiKey: string, message: string): Promise<string | null> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MEMORY_MODEL,
      stream: false,
      max_tokens: 60,
      temperature: 0,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            'Decide whether the user\'s message contains information worth remembering for future conversations — either an explicit request ("remember that...", "don\'t forget...", "keep in mind...") or a durable personal fact, preference, or constraint about the user (name, occupation, ongoing project, likes/dislikes, allergies, goals, tools they use, etc.). Ignore one-off questions, small talk, and anything not meant to persist. If there is something worth remembering, reply with exactly one concise sentence stating the fact from the user\'s perspective (e.g. "Prefers concise answers." or "Uses pnpm, not npm."). If there is nothing worth remembering, reply with exactly the single word "no".',
        },
        { role: "user", content: message.slice(0, 2000) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw || raw.toLowerCase().startsWith("no")) return null;
  return raw.slice(0, 300);
}

/**
 * Decides whether answering the user's message well would actually benefit from the stored
 * memory facts, rather than unconditionally injecting them (and showing a "Memory recall"
 * badge) on every single turn once any memory exists. Powers the "memory" setting's read path.
 */
export async function shouldRecallMemory(apiKey: string, query: string, memories: string[]): Promise<boolean> {
  const factsList = memories.slice(0, 50).map((m, i) => `${i + 1}. ${m}`).join("\n");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MEMORY_MODEL,
      stream: false,
      max_tokens: 40,
      temperature: 0,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            `Below is a list of facts remembered about the user from past conversations:\n${factsList}\n\nDecide whether answering the user's next message well would benefit from using any of these facts. Reply with exactly one word: "yes" or "no".`,
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
  if (!raw) throw new Error("Groq returned no decision.");
  return raw.startsWith("y");
}
