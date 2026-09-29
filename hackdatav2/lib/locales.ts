interface Pool {
  first: string[]; last: string[]; streets: string[]; cities: string[];
  phone: (n: () => number) => string;
  currency: string; taxLabel: string; taxRate: number;
}
const d = (n: () => number, len: number) => Array.from({ length: len }, () => Math.floor(n() * 10)).join("");

export const POOLS: Record<string, Pool> = {
  en_US: {
    first: ["Maria", "James", "Sofia", "Ahmed", "Emily", "Daniel", "Priya", "Lucas", "Hannah", "Omar"],
    last: ["Chen", "Raza", "Ivanova", "Miller", "Patel", "Nguyen", "Garcia", "Brooks", "Kim", "Osei"],
    streets: ["Maple Ave", "Oak St", "Cedar Ln", "Lakeview Dr", "Pine Rd"],
    cities: ["Austin", "Denver", "Portland", "Columbus", "Raleigh"],
    phone: n => `+1 (${200 + Math.floor(n() * 700)}) ${d(n, 3)}-${d(n, 4)}`,
    currency: "USD", taxLabel: "Sales tax", taxRate: 0.08,
  },
  en_GB: {
    first: ["Oliver", "Amelia", "Harry", "Isla", "Jack", "Ava", "Noah", "Freya", "Arthur", "Zara"],
    last: ["Smith", "Taylor", "Khan", "Davies", "Evans", "Wilson", "Hughes", "Clarke", "Singh", "Walker"],
    streets: ["High Street", "Station Road", "Church Lane", "Mill Road", "Park Avenue"],
    cities: ["Leeds", "Bristol", "Glasgow", "Norwich", "Cardiff"],
    phone: n => `+44 7${d(n, 3)} ${d(n, 6)}`,
    currency: "GBP", taxLabel: "VAT", taxRate: 0.2,
  },
  de_DE: {
    first: ["Lukas", "Anna", "Felix", "Lena", "Jonas", "Mia", "Paul", "Clara", "Leon", "Emma"],
    last: ["Müller", "Schneider", "Fischer", "Weber", "Becker", "Hoffmann", "Koch", "Richter", "Wolf", "Krüger"],
    streets: ["Hauptstraße", "Bahnhofstraße", "Gartenweg", "Schulstraße", "Bergstraße"],
    cities: ["Hamburg", "Leipzig", "Bremen", "Dresden", "Mainz"],
    phone: n => `+49 15${d(n, 1)} ${d(n, 8)}`,
    currency: "EUR", taxLabel: "MwSt.", taxRate: 0.19,
  },
  fr_FR: {
    first: ["Camille", "Louis", "Léa", "Hugo", "Manon", "Jules", "Chloé", "Nathan", "Inès", "Théo"],
    last: ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefèvre", "Roux", "Faure"],
    streets: ["Rue de la Paix", "Rue des Lilas", "Avenue Foch", "Rue Pasteur", "Rue Victor Hugo"],
    cities: ["Lyon", "Nantes", "Lille", "Toulouse", "Nice"],
    phone: n => `+33 6 ${d(n, 2)} ${d(n, 2)} ${d(n, 2)} ${d(n, 2)}`,
    currency: "EUR", taxLabel: "TVA", taxRate: 0.2,
  },
};
export const LOCALES = Object.keys(POOLS);
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD"];
export const pool = (locale: string) => POOLS[locale] ?? POOLS.en_US;
