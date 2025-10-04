"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { retailerLogo } from "@/lib/logos";
import { getSeason, scoreDeal } from "@/lib/scoring";

type Deal = {
  id: string;
  title: string;
  retailer: string;
  category: string;
  url: string;
  image?: string;
  price: number;
  originalPrice: number;
  currency: string;
  endsAt?: string;
  updatedAt: string;
  popularity: number;
  tags: string[];
  regions: string[];
};

// ---------- tiny UI helpers ----------
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        background: "#f3f4f6",
        padding: "2px 8px",
        fontSize: 12,
        border: "1px solid #e5e7eb",
      }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 20, fontWeight: 800, margin: "8px 0 12px" }}>
      {children}
    </h2>
  );
}

function Card({ deal }: { deal: Deal }) {
  const now = new Date();
  const { score, facets } = scoreDeal(deal, now, { season: getSeason(now) });
  const discountPct = Math.round((facets.discount ?? 0) * 100);
  const endsInDays = deal.endsAt
    ? Math.max(0, Math.ceil((new Date(deal.endsAt).getTime() - now.getTime()) / 86_400_000))
    : "—";

  // computed but we’ll use direct anchor below
  // kept to preserve intent and avoid “unused var” errors
  const _clickHref = `/api/click?id=${encodeURIComponent(deal.id)}`;
  const _directHref = deal.url || "#";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 10",
          background: "#f3f4f6",
        }}
      >
        const derivedImg =
  deal.image && deal.image.trim().length > 0
    ? deal.image
    : deal.url
    ? `/api/og-image?url=${encodeURIComponent(deal.url)}`
    : "";

{derivedImg ? (
  <img
    src={derivedImg}
    alt={deal.title}
    referrerPolicy="no-referrer"
    onError={(e) => {
      const logo = retailerLogo(deal.retailer);
      const el = e.currentTarget as HTMLImageElement;
      if (logo) el.src = logo;
      else el.style.display = "none";
    }}
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    loading="lazy"
  />
) : (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
    {retailerLogo(deal.retailer) ? (
      <img
        src={retailerLogo(deal.retailer)!}
        alt={deal.retailer}
        style={{ height: 40, opacity: 0.8 }}
      />
    ) : (
      <span style={{ color: "#9ca3af" }}>No image</span>
    )}
  </div>
)}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            {retailerLogo(deal.retailer) ? (
              <img
                src={retailerLogo(deal.retailer)!}
                alt={deal.retailer}
                style={{ height: 40, opacity: 0.8 }}
                loading="lazy"
              />
            ) : (
              <span style={{ color: "#9ca3af" }}>No image</span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div
              title={deal.title}
              style={{
                fontWeight: 700,
                fontSize: 16,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {deal.title}
            </div>
            <div
              style={{
                color: "#6b7280",
                fontSize: 13,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {deal.retailer} • {deal.category}
            </div>
          </div>
          <Badge>{discountPct}% off</Badge>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>
            {deal.currency} {Number(deal.price).toLocaleString()}
          </span>
          <span style={{ color: "#9ca3af", textDecoration: "line-through" }}>
            {deal.currency} {Number(deal.originalPrice).toLocaleString()}
          </span>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 16 }}>
            <Stat label="Score" value={score.toFixed(2)} />
            <Stat label="Ends" value={endsInDays} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(deal.tags || []).slice(0, 2).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={`/api/click?id=${encodeURIComponent(deal.id)}`}
            onClick={(e) => {
              // `id` is required, but keep a defensive fallback to direct URL
              if (!deal.id && deal.url) {
                e.preventDefault();
                window.open(deal.url, "_blank", "noopener,noreferrer");
              }
            }}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: "8px 12px",
              fontSize: 14,
              textDecoration: "none",
              color: "inherit",
              background: "#fff",
            }}
          >
            View deal ↗
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------- page ----------
export default function Page() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [retailer, setRetailer] = useState("All");
  const [minDiscount, setMinDiscount] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [sort, setSort] = useState<"score" | "newest" | "discount" | "priceAsc" | "priceDesc">(
    "score",
  );
  const [season, setSeason] = useState(getSeason(new Date()));
  const [deals, setDeals] = useState<Deal[]>([]);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Avoid crashing if API returns { deals: [...] } or [...]
    fetch("/api/deals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        const rows: Deal[] = Array.isArray(data) ? data : (data?.deals ?? []);
        setDeals(rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setDeals([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allCategories = useMemo(
    () => ["All", ...Array.from(new Set(deals.map((d) => d.category)))],
    [deals],
  );
  const retailers = useMemo(
    () => ["All", ...Array.from(new Set(deals.map((d) => d.retailer)))],
    [deals],
  );

  // Featured: top 8 by score
  const topDeals = useMemo(() => {
    const now = new Date();
    return [...deals]
      .map((d) => ({ ...d, _score: scoreDeal(d, now, { season }).score }))
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 8);
  }, [deals, season]);

  // Featured categories: most common 6
  const featuredCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    deals.forEach((d) => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  }, [deals]);

  // All deals (filtered section)
  const filtered = useMemo(() => {
    const now = new Date();
    const rows = deals
      .filter((d) => {
        const q = query.toLowerCase().trim();
        const base = d.originalPrice > 0 ? d.originalPrice : d.price || 1;
        const discount = Math.round(((base - d.price) / base) * 100);

        return (
          (category === "All" || d.category === category) &&
          (retailer === "All" || d.retailer === retailer) &&
          (minDiscount === 0 || discount >= minDiscount) &&
          (maxPrice === 0 || d.price <= maxPrice) &&
          (!q ||
            (d.title + " " + d.retailer + " " + (d.tags || []).join(" ")).toLowerCase().includes(q))
        );
      })
      .map((d) => ({
        ...d,
        score: scoreDeal(d, now, { season }).score,
        discountPct: Math.round(
          (((d.originalPrice > 0 ? d.originalPrice : d.price || 1) - d.price) /
            (d.originalPrice > 0 ? d.originalPrice : d.price || 1)) *
            100,
        ),
      }))
      .sort((a: any, b: any) => {
        const sorters: Record<string, (x: any, y: any) => number> = {
          score: (x, y) => y.score - x.score,
          newest: (x, y) =>
            new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime(),
          discount: (x, y) => y.discountPct - x.discountPct,
          priceAsc: (x, y) => x.price - y.price,
          priceDesc: (x, y) => y.price - x.price,
        };
        return (sorters[sort] || sorters.score)(a, b);
      });

    return rows;
  }, [deals, query, category, retailer, minDiscount, maxPrice, sort, season]);

  const goToAllDeals = (newCategory?: string) => {
    if (newCategory) setCategory(newCategory);
    if (filtersRef.current) {
      filtersRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      {/* HERO */}
      <header style={{ padding: "8px 0 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -0.5, margin: 0 }}>
          Spring Steals
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 6 }}>
          AU seasonal deals ranked by discount, freshness, season fit and popularity.
        </p>
      </header>

      {/* HOT DEALS */}
      <SectionTitle>This Week’s Hot Deals</SectionTitle>
      {topDeals.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "#6b7280",
            border: "1px dashed #d1d5db",
            borderRadius: 16,
          }}
        >
          No hot deals yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {topDeals.map((d) => (
            <Card key={d.id} deal={d} />
          ))}
        </div>
      )}

      {/* FEATURED CATEGORIES */}
      {featuredCategories.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle>Featured Categories</SectionTitle>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {featuredCategories.map((c) => (
              <button
                key={c}
                onClick={() => goToAllDeals(c)}
                style={{
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  padding: "8px 12px",
                  background: "#fff",
                  cursor: "pointer",
                }}
                aria-label={`Browse ${c} deals`}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => goToAllDeals("All")}
              style={{
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                padding: "8px 12px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              View all
            </button>
          </div>
        </div>
      )}

      {/* FILTER BAR + ALL DEALS */}
      <div ref={filtersRef} />
      <SectionTitle>All Deals</SectionTitle>

      <section
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#fafafa",
          paddingBottom: 8,
          marginBottom: 12,
        }}
        aria-label="Filters"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 8,
            padding: 16,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, tags, retailers…"
            style={{ gridColumn: "span 2", padding: 8 }}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={retailer} onChange={(e) => setRetailer(e.target.value)}>
            {retailers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280" }}>Min Discount</label>
            <div>
              <input
                type="number"
                min={0}
                max={90}
                value={minDiscount}
                onChange={(e) => setMinDiscount(Number(e.target.value) || 0)}
                style={{ width: 80, padding: 8 }}
              />{" "}
              %
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280" }}>Max Price</label>
            <div>
              <input
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
                style={{ width: 120, padding: 8 }}
              />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value as any)}
            aria-label="Season"
          >
            {["Summer", "Autumn", "Winter", "Spring"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            aria-label="Sort"
          >
            <option value="score">Sort: Best Score</option>
            <option value="newest">Sort: Newest</option>
            <option value="discount">Sort: Biggest Discount</option>
            <option value="priceAsc">Sort: Price (Low→High)</option>
            <option value="priceDesc">Sort: Price (High→Low)</option>
          </select>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "#6b7280",
            border: "1px dashed #d1d5db",
            borderRadius: 16,
          }}
        >
          No deals match your filters.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((d) => (
            <Card key={d.id} deal={d} />
          ))}
        </div>
      )}

      <footer style={{ marginTop: 24, fontSize: 12, color: "#6b7280" }}>
        <p>
          <b>Heads up:</b> Some sample data shown. We’re connecting live retailer feeds next.
        </p>
      </footer>
    </div>
  );
}
