const encoder = new TextEncoder();

export function ndjsonLine(obj: Record<string, unknown>): Uint8Array {
  return encoder.encode(JSON.stringify(obj) + "\n");
}

/**
 * Converts an upstream OpenAI-compatible SSE chat-completions stream
 * (`data: {...}\n\n` frames, `[DONE]` sentinel) into Scribble's normalized
 * NDJSON wire protocol: one `{"delta": "..."}` line per token, then
 * `{"done": true}`. Shared by xKiro, Groq, and Mistral — all three speak
 * the same OpenAI-style streaming format.
 */
export function openAICompatibleStream(upstream: Response): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line.startsWith("data:")) continue;

            const data = line.slice(5).trim();
            if (data === "[DONE]" || !data) continue;

            try {
              const json = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(ndjsonLine({ delta }));
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
        controller.enqueue(ndjsonLine({ done: true }));
      } catch (err) {
        controller.enqueue(ndjsonLine({ error: err instanceof Error ? err.message : "Upstream stream error" }));
      } finally {
        controller.close();
      }
    },
  });
}
