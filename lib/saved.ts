export type SavedBusiness = {
  id: string;
  name: string;
  area: string;
  category: string;
  verified?: boolean;
  availability?: string;
};

export const SAVED_BUSINESSES_KEY = "remarket-saved-businesses";

export function getSavedBusinesses(): SavedBusiness[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(SAVED_BUSINESSES_KEY);

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Unable to read saved businesses:", error);
    return [];
  }
}

export function isBusinessSaved(id: string): boolean {
  return getSavedBusinesses().some((business) => business.id === id);
}

export function saveBusiness(business: SavedBusiness): void {
  const saved = getSavedBusinesses();

  if (saved.some((item) => item.id === business.id)) {
    return;
  }

  localStorage.setItem(
    SAVED_BUSINESSES_KEY,
    JSON.stringify([...saved, business])
  );
}

export function removeSavedBusiness(id: string): void {
  const saved = getSavedBusinesses();

  const updated = saved.filter((business) => business.id !== id);

  localStorage.setItem(
    SAVED_BUSINESSES_KEY,
    JSON.stringify(updated)
  );
}