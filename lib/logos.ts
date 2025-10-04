export function retailerLogo(retailer: string) {
  const map: Record<string, string> = {
    "Nike AU": "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg",
    "Sony AU": "https://upload.wikimedia.org/wikipedia/commons/2/22/Sony_logo.svg",
    "Apple Store": "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg",
    "Samsung AU": "https://upload.wikimedia.org/wikipedia/commons/2/24/Samsung_Logo.svg",
    "Adidas AU": "https://upload.wikimedia.org/wikipedia/commons/2/20/Adidas_Logo.svg",
    "Dyson AU": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Dyson_logo.svg"
  };
  return map[retailer] || "";
}
