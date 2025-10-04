import { nikeMockProvider, type NormalizedDeal } from "./nike";

export async function fetchAllProviders(): Promise<NormalizedDeal[]> {
  // Add more providers later (Good Guys, JB Hi-Fi, Dyson, etc.)
  const chunks = await Promise.all([nikeMockProvider()]);
  return chunks.flat();
}
