// lib/saved.ts

/**
 * Saved items are kept separately by type so existing business-saving
 * functionality and its localStorage data remain backwards compatible.
 * All changes also emit the legacy shared event so existing listeners
 * continue to refresh without needing immediate changes everywhere.
 */

export type SavedBusiness = {
  id: string;
  name: string;
  area: string;
  category: string;
  verified?: boolean;
  availability?: string;
  imageUrl?: string | null;
};

export type SavedProduct = {
  id: string;
  name: string;
  businessId?: string;
  businessName?: string | null;
  area?: string | null;
  category?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?: string;
  imageUrl?: string | null;
};

export type SavedService = {
  id: string;
  name: string;
  businessId?: string;
  businessName?: string | null;
  area?: string | null;
  category?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  durationMinutes?: number | null;
  fulfillmentType?: string;
  availability?: string;
  imageUrl?: string | null;
};

export const SAVED_BUSINESSES_KEY = "remarket-saved-businesses";
export const SAVED_PRODUCTS_KEY = "remarket-saved-products";
export const SAVED_SERVICES_KEY = "remarket-saved-services";

/** Legacy event name retained for all existing imports/listeners. */
export const SAVED_BUSINESSES_CHANGED_EVENT = "remarket-saved-changed";
export const SAVED_ITEMS_CHANGED_EVENT = "remarket-saved-items-changed";
export const SAVED_BUSINESSES_TYPE_CHANGED_EVENT = "remarket-saved-businesses-changed";
export const SAVED_PRODUCTS_CHANGED_EVENT = "remarket-saved-products-changed";
export const SAVED_SERVICES_CHANGED_EVENT = "remarket-saved-services-changed";

type HasId = { id: string };
type Validator<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isSavedBusiness(value: unknown): value is SavedBusiness {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    typeof value.area === "string" &&
    typeof value.category === "string" &&
    (value.verified === undefined || typeof value.verified === "boolean") &&
    isOptionalString(value.availability) &&
    isOptionalNullableString(value.imageUrl)
  );
}

function isSavedProduct(value: unknown): value is SavedProduct {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    isOptionalString(value.businessId) &&
    isOptionalNullableString(value.businessName) &&
    isOptionalNullableString(value.area) &&
    isOptionalNullableString(value.category) &&
    isOptionalFiniteNumber(value.price) &&
    isOptionalFiniteNumber(value.priceMin) &&
    isOptionalFiniteNumber(value.priceMax) &&
    isOptionalString(value.availability) &&
    isOptionalNullableString(value.imageUrl)
  );
}

function isSavedService(value: unknown): value is SavedService {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    isOptionalString(value.businessId) &&
    isOptionalNullableString(value.businessName) &&
    isOptionalNullableString(value.area) &&
    isOptionalNullableString(value.category) &&
    isOptionalFiniteNumber(value.price) &&
    isOptionalFiniteNumber(value.priceMin) &&
    isOptionalFiniteNumber(value.priceMax) &&
    isOptionalFiniteNumber(value.durationMinutes) &&
    isOptionalString(value.fulfillmentType) &&
    isOptionalString(value.availability) &&
    isOptionalNullableString(value.imageUrl)
  );
}

function readItems<T>(key: string, validator: Validator<T>): T[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(validator);
  } catch (error) {
    console.error(`Unable to read saved items from ${key}:`, error);
    return [];
  }
}

function notifySavedItemsChanged(
  typeEvent: string,
  notifyLegacyBusinessListeners = false,
): void {
  if (typeof window === "undefined") return;

  // New shared event for the upgraded Saved page.
  window.dispatchEvent(new Event(SAVED_ITEMS_CHANGED_EVENT));

  // Type-specific event lets a consumer react to one saved-item category.
  window.dispatchEvent(new Event(typeEvent));

  // Existing pages and components continue receiving the legacy event,
  // but only business changes trigger their old business-only refresh.
  if (notifyLegacyBusinessListeners) {
    window.dispatchEvent(new Event(SAVED_BUSINESSES_CHANGED_EVENT));
  }
}

function writeItems<T extends HasId>(
  key: string,
  items: T[],
  typeEvent: string,
  notifyLegacyBusinessListeners = false,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    notifySavedItemsChanged(typeEvent, notifyLegacyBusinessListeners);
  } catch (error) {
    console.error(`Unable to update saved items in ${key}:`, error);
  }
}

function saveItem<T extends HasId>(
  key: string,
  item: T,
  validator: Validator<T>,
  typeEvent: string,
  notifyLegacyBusinessListeners = false,
): void {
  if (typeof window === "undefined") return;

  if (!validator(item)) {
    console.error(`Invalid saved item supplied for ${key}.`);
    return;
  }

  const saved = readItems(key, validator);
  const existingIndex = saved.findIndex((savedItem) => savedItem.id === item.id);

  if (existingIndex >= 0) {
    const existing = saved[existingIndex];
    const updated = [...saved];
    updated[existingIndex] = { ...existing, ...item };
    writeItems(key, updated, typeEvent, notifyLegacyBusinessListeners);
    return;
  }

  writeItems(key, [...saved, item], typeEvent, notifyLegacyBusinessListeners);
}

function removeItem<T extends HasId>(
  key: string,
  id: string,
  validator: Validator<T>,
  typeEvent: string,
  notifyLegacyBusinessListeners = false,
): void {
  if (typeof window === "undefined" || !id) return;

  const saved = readItems(key, validator);
  const updated = saved.filter((item) => item.id !== id);

  if (updated.length !== saved.length) {
    writeItems(key, updated, typeEvent, notifyLegacyBusinessListeners);
  }
}

function isItemSaved<T extends HasId>(
  key: string,
  id: string,
  validator: Validator<T>,
): boolean {
  if (!id) return false;
  return readItems(key, validator).some((item) => item.id === id);
}

/* -------------------------------------------------------------------------- */
/* BUSINESSES                                                                 */
/* -------------------------------------------------------------------------- */

export function getSavedBusinesses(): SavedBusiness[] {
  return readItems(SAVED_BUSINESSES_KEY, isSavedBusiness);
}

export function isBusinessSaved(id: string): boolean {
  return isItemSaved(SAVED_BUSINESSES_KEY, id, isSavedBusiness);
}

export function saveBusiness(business: SavedBusiness): void {
  if (!business || typeof business !== "object") return;

  const normalizedBusiness: SavedBusiness = {
    id: business.id,
    name: business.name,
    area: business.area,
    category: business.category,
    ...(business.verified !== undefined ? { verified: business.verified } : {}),
    ...(business.availability !== undefined
      ? { availability: business.availability }
      : {}),
    imageUrl: business.imageUrl ?? null,
  };

  saveItem(
    SAVED_BUSINESSES_KEY,
    normalizedBusiness,
    isSavedBusiness,
    SAVED_BUSINESSES_TYPE_CHANGED_EVENT,
    true,
  );
}

export function removeSavedBusiness(id: string): void {
  removeItem(
    SAVED_BUSINESSES_KEY,
    id,
    isSavedBusiness,
    SAVED_BUSINESSES_TYPE_CHANGED_EVENT,
    true,
  );
}

/* -------------------------------------------------------------------------- */
/* PRODUCTS                                                                   */
/* -------------------------------------------------------------------------- */

export function getSavedProducts(): SavedProduct[] {
  return readItems(SAVED_PRODUCTS_KEY, isSavedProduct);
}

export function isProductSaved(id: string): boolean {
  return isItemSaved(SAVED_PRODUCTS_KEY, id, isSavedProduct);
}

export function saveProduct(product: SavedProduct): void {
  if (!product || typeof product !== "object") return;

  const normalizedProduct: SavedProduct = {
    id: product.id,
    name: product.name,
    ...(product.businessId !== undefined ? { businessId: product.businessId } : {}),
    ...(product.businessName !== undefined ? { businessName: product.businessName } : {}),
    ...(product.area !== undefined ? { area: product.area } : {}),
    ...(product.category !== undefined ? { category: product.category } : {}),
    ...(product.price !== undefined ? { price: product.price } : {}),
    ...(product.priceMin !== undefined ? { priceMin: product.priceMin } : {}),
    ...(product.priceMax !== undefined ? { priceMax: product.priceMax } : {}),
    ...(product.availability !== undefined ? { availability: product.availability } : {}),
    ...(product.imageUrl !== undefined ? { imageUrl: product.imageUrl } : {}),
  };

  saveItem(
    SAVED_PRODUCTS_KEY,
    normalizedProduct,
    isSavedProduct,
    SAVED_PRODUCTS_CHANGED_EVENT,
  );
}

export function removeSavedProduct(id: string): void {
  removeItem(
    SAVED_PRODUCTS_KEY,
    id,
    isSavedProduct,
    SAVED_PRODUCTS_CHANGED_EVENT,
  );
}

/* -------------------------------------------------------------------------- */
/* SERVICES                                                                   */
/* -------------------------------------------------------------------------- */

export function getSavedServices(): SavedService[] {
  return readItems(SAVED_SERVICES_KEY, isSavedService);
}

export function isServiceSaved(id: string): boolean {
  return isItemSaved(SAVED_SERVICES_KEY, id, isSavedService);
}

export function saveService(service: SavedService): void {
  if (!service || typeof service !== "object") return;

  const normalizedService: SavedService = {
    id: service.id,
    name: service.name,
    ...(service.businessId !== undefined ? { businessId: service.businessId } : {}),
    ...(service.businessName !== undefined ? { businessName: service.businessName } : {}),
    ...(service.area !== undefined ? { area: service.area } : {}),
    ...(service.category !== undefined ? { category: service.category } : {}),
    ...(service.price !== undefined ? { price: service.price } : {}),
    ...(service.priceMin !== undefined ? { priceMin: service.priceMin } : {}),
    ...(service.priceMax !== undefined ? { priceMax: service.priceMax } : {}),
    ...(service.durationMinutes !== undefined
      ? { durationMinutes: service.durationMinutes }
      : {}),
    ...(service.fulfillmentType !== undefined
      ? { fulfillmentType: service.fulfillmentType }
      : {}),
    ...(service.availability !== undefined ? { availability: service.availability } : {}),
    ...(service.imageUrl !== undefined ? { imageUrl: service.imageUrl } : {}),
  };

  saveItem(
    SAVED_SERVICES_KEY,
    normalizedService,
    isSavedService,
    SAVED_SERVICES_CHANGED_EVENT,
  );
}

export function removeSavedService(id: string): void {
  removeItem(
    SAVED_SERVICES_KEY,
    id,
    isSavedService,
    SAVED_SERVICES_CHANGED_EVENT,
  );
}
