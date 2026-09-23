// lib/saved.ts

export type SavedBusiness = {
  id: string;
  name: string;
  area: string;
  category: string;
  verified?: boolean;
  availability?: string;
  imageUrl?: string | null;
};

export const SAVED_BUSINESSES_KEY =
  "remarket-saved-businesses";

export const SAVED_BUSINESSES_CHANGED_EVENT =
  "remarket-saved-changed";

function isSavedBusiness(
  value: unknown
): value is SavedBusiness {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const business =
    value as Record<
      string,
      unknown
    >;

  return (
    typeof business.id ===
      "string" &&
    typeof business.name ===
      "string" &&
    typeof business.area ===
      "string" &&
    typeof business.category ===
      "string"
  );
}

export function getSavedBusinesses(): SavedBusiness[] {
  if (
    typeof window ===
    "undefined"
  ) {
    return [];
  }

  try {
    const stored =
      localStorage.getItem(
        SAVED_BUSINESSES_KEY
      );

    if (!stored) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (
      !Array.isArray(parsed)
    ) {
      return [];
    }

    return parsed.filter(
      isSavedBusiness
    );
  } catch (error) {
    console.error(
      "Unable to read saved businesses:",
      error
    );

    return [];
  }
}

export function isBusinessSaved(
  id: string
): boolean {
  return getSavedBusinesses().some(
    (business) =>
      business.id === id
  );
}

function notifySavedBusinessesChanged(): void {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new Event(
      SAVED_BUSINESSES_CHANGED_EVENT
    )
  );
}

export function saveBusiness(
  business: SavedBusiness
): void {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  const saved =
    getSavedBusinesses();

  if (
    saved.some(
      (item) =>
        item.id ===
        business.id
    )
  ) {
    return;
  }

  const normalizedBusiness: SavedBusiness =
    {
      id: business.id,
      name: business.name,
      area: business.area,
      category:
        business.category,
      verified:
        business.verified,
      availability:
        business.availability,
      imageUrl:
        business.imageUrl ??
        null,
    };

  localStorage.setItem(
    SAVED_BUSINESSES_KEY,
    JSON.stringify([
      ...saved,
      normalizedBusiness,
    ])
  );

  notifySavedBusinessesChanged();
}

export function removeSavedBusiness(
  id: string
): void {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  const saved =
    getSavedBusinesses();

  const updated =
    saved.filter(
      (business) =>
        business.id !== id
    );

  localStorage.setItem(
    SAVED_BUSINESSES_KEY,
    JSON.stringify(updated)
  );

  notifySavedBusinessesChanged();
}