export type NormalizedDeal = {
  id: string;
  retailer: string;
  category: string;
  title: string;
  url: string;
  image?: string;
  price: number;
  originalPrice: number;
  currency: string;
  tags: string[];
  regions: string[];
  popularity: number;
  endsAt?: string;
  updatedAt: string;
};

// Mock provider so the site works immediately
export async function nikeMockProvider(): Promise<NormalizedDeal[]> {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  return [
    {
      id: "nike-pegasus-41",
      retailer: "Nike AU",
      category: "Fashion",
      title: "Nike Pegasus 41",
      url: "https://example.com/deal/pegasus",
      image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?q=80&w=1280&auto=format&fit=crop",
      price: 149,
      originalPrice: 239,
      currency: "AUD",
      tags: ["Spring", "running", "shoes"],
      regions: ["AU", "NZ"],
      popularity: 90,
      endsAt: iso(new Date(now.getTime() + 3 * 864e5)),
      updatedAt: iso(new Date(now.getTime() - 1 * 3600e3))
    },
    {
      id: "nike-invincible-3",
      retailer: "Nike AU",
      category: "Fashion",
      title: "Nike Invincible 3",
      url: "https://example.com/deal/invincible3",
      image: "https://images.unsplash.com/photo-1539185441755-769473a23570?q=80&w=1280&auto=format&fit=crop",
      price: 199,
      originalPrice: 259,
      currency: "AUD",
      tags: ["Spring"],
      regions: ["AU"],
      popularity: 70,
      endsAt: iso(new Date(now.getTime() + 4 * 864e5)),
      updatedAt: iso(new Date(now.getTime() - 2 * 3600e3))
    }
  ];
}
