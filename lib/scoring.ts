export function getSeason(date = new Date()): "Summer" | "Autumn" | "Winter" | "Spring" {
  const m = date.getMonth() + 1;
  if (m === 12 || m <= 2) return "Summer";
  if (m >= 3 && m <= 5) return "Autumn";
  if (m >= 6 && m <= 8) return "Winter";
  return "Spring";
}

export function scoreDeal(deal: any, now = new Date(), opts?: { season?: string }) {
  const season = opts?.season || getSeason(now);
  const w = { discount: 0.4, recency: 0.15, season: 0.2, popularity: 0.15, urgency: 0.1 };

  const discount = Math.max(0, Math.min(1, (deal.originalPrice - deal.price) / (deal.originalPrice || 1)));
  const hoursSinceUpdate = Math.max(0, (now.getTime() - new Date(deal.updatedAt).getTime()) / 36e5);
  const recency = Math.max(0, 1 - Math.min(1, hoursSinceUpdate / 48));
  const seasonMatch = (deal.tags || []).some((t: string) => t.toLowerCase().includes(season.toLowerCase())) ? 1 : 0;
  const popularity = Math.max(0, Math.min(1, (deal.popularity || 0) / 100));
  const msUntilEnd = deal.endsAt ? Math.max(0, new Date(deal.endsAt).getTime() - now.getTime()) : 0;
  const urgency = deal.endsAt ? 1 - Math.min(1, msUntilEnd / (7 * 24 * 3600 * 1000)) : 0;

  const score = w.discount * discount + w.recency * recency + w.season * seasonMatch + w.popularity * popularity + w.urgency * urgency;
  return { score, facets: { discount, recency, seasonMatch, popularity, urgency } };
}
