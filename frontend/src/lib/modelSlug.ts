/** Turns a model id ("mistral/mistral-small-latest") into a URL/RTDB-safe slug
 * ("mistral-mistral-small-latest"). Shared by the docs pages (as the "/docs/{slug}"
 * route) and modelStats.ts (as the RTDB key each usage increment is filed under). */
export function modelSlug(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[/:._]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
