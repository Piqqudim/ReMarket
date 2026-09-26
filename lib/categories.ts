import {
  Briefcase,
  Building2,
  Camera,
  Car,
  Coffee,
  Cpu,
  Dumbbell,
  Gift,
  Heart,
  Home,
  Layers3,
  Laptop,
  MapPin,
  Package,
  Scissors,
  Shirt,
  Smartphone,
  Sparkles,
  Store,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type ReMarketCategory = {
  id: string;
  name: string;
  iconKey: string;
  icon: LucideIcon;
  bg: string;
};

export type ApiCategory = {
  id: string;
  name: string;
  iconKey?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

export const DEFAULT_CATEGORIES: ReMarketCategory[] = [
  {
    id: "fashion",
    name: "Fashion",
    iconKey: "Shirt",
    icon: Shirt,
    bg: "#FFE0D6",
  },
  {
    id: "electronics",
    name: "Electronics",
    iconKey: "Plug",
    icon: Cpu,
    bg: "#DDF5EA",
  },
  {
    id: "food",
    name: "Food",
    iconKey: "Utensils",
    icon: Utensils,
    bg: "#FFF0C7",
  },
  {
    id: "beauty",
    name: "Beauty",
    iconKey: "Sparkles",
    icon: Sparkles,
    bg: "#E7E5FF",
  },
  {
    id: "textiles",
    name: "Textiles",
    iconKey: "Layers3",
    icon: Layers3,
    bg: "#F9DCE8",
  },
  {
    id: "services",
    name: "Services",
    iconKey: "Briefcase",
    icon: Briefcase,
    bg: "#E4E9EF",
  },
];

export const CATEGORY_ICON_MAP: Record<
  string,
  LucideIcon
> = {
  Store,
  Shirt,
  Smartphone,
  Laptop,
  Cpu,
  Utensils,
  Coffee,
  Sparkles,
  Scissors,
  Layers3,
  Wrench,
  Briefcase,
  Building2,
  Home,
  Car,
  MapPin,
  Package,
  Gift,
  Dumbbell,
  Camera,
  Heart,
};

export function getCategoryIcon(
  iconKey?: string | null
): LucideIcon {
  if (!iconKey) {
    return Store;
  }

  return CATEGORY_ICON_MAP[iconKey] ?? Store;
}

export function getDefaultCategory(
  name: string
): ReMarketCategory | undefined {
  return DEFAULT_CATEGORIES.find(
    (category) =>
      category.name.toLowerCase() ===
      name.trim().toLowerCase()
  );
}

export function mergeCategories(
  backendCategories: ApiCategory[]
): ReMarketCategory[] {
  const result: ReMarketCategory[] = [];
  const seen = new Set<string>();

  for (const backendCategory of backendCategories) {
    if (backendCategory.isActive === false) {
      continue;
    }

    const normalizedName =
      backendCategory.name.trim().toLowerCase();

    if (!normalizedName || seen.has(normalizedName)) {
      continue;
    }

    const fallback = getDefaultCategory(
      backendCategory.name
    );

    result.push({
      id: backendCategory.id,
      name: backendCategory.name,
      iconKey:
        backendCategory.iconKey ||
        fallback?.iconKey ||
        "Store",
      icon:
        getCategoryIcon(
          backendCategory.iconKey ||
            fallback?.iconKey
        ),
      bg: fallback?.bg || "#F3F4F6",
    });

    seen.add(normalizedName);
  }

  return result;
}