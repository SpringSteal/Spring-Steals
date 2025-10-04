import { NextResponse } from "next/server";
import { fetchAllProviders } from "@/lib/providers";
import { scoreDeal, getSeason } from "@/lib/scoring";

export async function GET() {
  const now = new Date();
  const season = getSeason(now);
  const raw = await fetchAllProviders();

  const deals = raw
    .map(d => ({ ...d, score: scoreDeal(d, now, { season }).score }))
    .sort((a: any, b: any) => b.score - a.score);

  return NextResponse.json(deals);
}
