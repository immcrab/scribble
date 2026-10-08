/**
 * xKiro model ids that its public catalog marked `access_tier: "free"` when
 * Lofin's catalog was last refreshed. This Worker-side allowlist is deliberate:
 * the browser catalog is not a security boundary, so a caller must not be able
 * to substitute a paid xKiro id (or a different provider) in a hand-made API
 * request. Keep this in sync with frontend/src/config/models.ts.
 */
export const FREE_XKIRO_MODEL_IDS = new Set<string>([
  "qwen/qwen3.8-omni-flash:free", "qwen/qwen3.8-max:free", "qwen/qwen3.7-max:free", "qwen/qwen3.7-plus:free",
  "qwen/qwen3.7-flash:free",
  "qwen/qwen3.6-max-preview:free", "qwen/qwen3.6-plus:free", "qwen/qwen3.6-27b:free", "qwen/qwen3.6-35b-a3b:free",
  "qwen/qwen3.5-397b-a17b:free", "qwen/qwen3.5-plus:free", "qwen/qwen3.5-flash:free", "qwen/qwen3.5-omni-plus:free",
  "qwen/qwen3.5-omni-flash:free", "qwen/qwen3-max:free", "qwen/qwen3-coder-plus:free", "qwen/qwen3-vl-plus:free",
  "qwen/qwen3-omni-flash:free", "qwen/qwen-plus-2025-07-28:free",
  "mistralai/mistral-large-2512", "mistralai/mistral-large-4-0", "mistralai/mistral-medium-3.5", "mistralai/mistral-small-2603", "mistralai/ministral-14b",
  "mistralai/ministral-8b", "mistralai/ministral-3b", "mistralai/codestral-2508", "mistralai/devstral-medium",
  "meta/muse-spark-1.3-contributor:free", "meta/muse-spark-1.2-contributor:free", "meituan/longcat-2.0", "meituan/longcat-2.5-preview:free", "stealth/space-bunny-alpha:free",
  "stealth/big-pickle", "apodex/apodex-1.1-mini:free",
  "sensenova/sensenova-6.8-flash-lite", "sensenova/sensenova-6.7-flash-lite",
  "cohere/command-a-plus", "cohere/north-mini-code", "cohere/command-a-reasoning",
  "cohere/command-a-vision", "cohere/command-a", "cohere/command-a-translate", "cohere/north-small-translate",
  "cohere/command-r-plus-08-2024", "cohere/command-r-08-2024", "cohere/command-r7b-12-2024", "cohere/aya-expanse-32b",
  "cohere/aya-vision-32b", "cohere/tiny-aya-global", "cohere/tiny-aya-earth", "cohere/tiny-aya-fire", "cohere/tiny-aya-water",
]);
