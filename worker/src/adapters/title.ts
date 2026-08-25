/** Cheap, fast Groq model used only to name chats — never surfaced as a selectable model.
 * It's a reasoning model, so `reasoning_effort: "low"` below is required — without it, the
 * model spends the whole `max_tokens` budget on hidden chain-of-thought and returns empty
 * content, which surfaced as every chat silently falling back to its truncated-prompt title. */
const TITLE_MODEL = "openai/gpt-oss-20b";

/**
 * One-shot, non-streaming completion that turns a user's first message into a
 * short sidebar label. Falls back to the caller's truncated-prompt title on
 * any upstream failure — see the /api/chat/title handler in index.ts.
 */
export async function generateTitle({ apiKey, prompt }: { apiKey: string; prompt: string }): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: TITLE_MODEL,
      stream: false,
      max_tokens: 100,
      temperature: 0.3,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            "Summarize the user's message as a chat title: 2-6 words, no quotes, no trailing punctuation, plain text only. Reply with nothing but the title.",
        },
        { role: "user", content: prompt.slice(0, 2000) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Groq returned no title.");

  return raw.replace(/^["'`]+|["'`]+$/g, "").replace(/[.!]+$/, "").slice(0, 60);
}
