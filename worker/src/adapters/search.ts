export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
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
