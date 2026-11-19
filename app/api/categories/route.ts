import {
  BusinessStatus,
  Prisma,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

type ListingType = "all" | "product" | "service";

type CategoryCount = {
  products: number;
  services: number;
  totalListings: number;
};

type FormattedCategory = {
  id: string;
  name: string;
  iconKey: string;
  imageUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  _count: CategoryCount;
};

type NavigationCategory = FormattedCategory & {
  children: NavigationCategory[];
};

const CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

const NO_STORE = "no-store, max-age=0, must-revalidate";

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function responseHeaders(
  baseHeaders?: HeadersInit,
  cacheControl = NO_STORE,
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set("Cache-Control", cacheControl);

  if (cacheControl === NO_STORE) {
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }

  return headers;
}

function jsonError(
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    {
      categories: [],
      navigationCategories: [],
      total: 0,
      error: message,
    },
    {
      status,
      headers: responseHeaders(headers),
    },
  );
}

function parseListingType(value: string): ListingType | null {
  if (!value || value === "all") {
    return "all";
  }

  if (value === "product" || value === "service") {
    return value;
  }

  return null;
}

function hasListingsForType(
  category: FormattedCategory,
  listingType: ListingType,
): boolean {
  if (listingType === "product") {
    return category._count.products > 0;
  }

  if (listingType === "service") {
    return category._count.services > 0;
  }

  return category._count.totalListings > 0;
}

function buildInheritedProductCategoryWhere(
  categoryName: string,
): Prisma.ProductWhereInput {
  return {
    status: BusinessStatus.ACTIVE,
    deletedAt: null,
    category: {
      is: null,
    },
    business: {
      is: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        categories: {
          some: {
            category: {
              isActive: true,
              name: {
                equals: categoryName,
                mode: "insensitive",
              },
            },
          },
        },
      },
    },
  };
}

function buildInheritedServiceCategoryWhere(
  categoryName: string,
): Prisma.ServiceWhereInput {
  return {
    status: BusinessStatus.ACTIVE,
    deletedAt: null,
    category: {
      is: null,
    },
    business: {
      is: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        categories: {
          some: {
            category: {
              isActive: true,
              name: {
                equals: categoryName,
                mode: "insensitive",
              },
            },
          },
        },
      },
    },
  };
}

function wouldCreateCycle(
  categoryId: string,
  candidateParentId: string,
  parentById: Map<string, string | null>,
): boolean {
  const visited = new Set<string>([categoryId]);
  let currentId: string | null = candidateParentId;

  while (currentId) {
    if (visited.has(currentId)) {
      return true;
    }

    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  return false;
}

/* Adds each active descendant's counts to its ancestors. */
function aggregateDescendantCounts(
  categories: FormattedCategory[],
): FormattedCategory[] {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );

  const childrenByParent = new Map<string, FormattedCategory[]>();

  for (const category of categories) {
    if (!category.parentId || !categoryById.has(category.parentId)) {
      continue;
    }

    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category);
    childrenByParent.set(category.parentId, siblings);
  }

  function getAggregateCounts(
    categoryId: string,
    visited = new Set<string>(),
  ): CategoryCount {
    const category = categoryById.get(categoryId);

    if (!category) {
      return {
        products: 0,
        services: 0,
        totalListings: 0,
      };
    }

    const counts: CategoryCount = {
      products: category._count.products,
      services: category._count.services,
      totalListings: category._count.totalListings,
    };

    if (visited.has(categoryId)) {
      return counts;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(categoryId);

    for (const child of childrenByParent.get(categoryId) ?? []) {
      if (nextVisited.has(child.id)) {
        continue;
      }

      const childCounts = getAggregateCounts(
        child.id,
        nextVisited,
      );

      counts.products += childCounts.products;
      counts.services += childCounts.services;
    }

    counts.totalListings = counts.products + counts.services;
    return counts;
  }

  return categories.map((category) => ({
    ...category,
    _count: getAggregateCounts(category.id),
  }));
}

function buildNavigationTree(
  categories: FormattedCategory[],
  includeEmpty: boolean,
  listingType: ListingType,
): NavigationCategory[] {
  const includedIds = new Set<string>();

  if (includeEmpty) {
    for (const category of categories) {
      includedIds.add(category.id);
    }
  } else {
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );

    for (const category of categories) {
      if (!hasListingsForType(category, listingType)) {
        continue;
      }

      includedIds.add(category.id);
      let parentId = category.parentId;
      const visited = new Set<string>([category.id]);

      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = categoryById.get(parentId);

        if (!parent) {
          break;
        }

        includedIds.add(parent.id);
        parentId = parent.parentId;
      }
    }
  }

  const includedCategories = categories.filter(
    (category) => includedIds.has(category.id),
  );

  const parentById = new Map(
    includedCategories.map((category) => [
      category.id,
      category.parentId,
    ]),
  );

  const nodes = new Map<string, NavigationCategory>();

  for (const category of includedCategories) {
    nodes.set(category.id, {
      ...category,
      children: [],
    });
  }

  const roots: NavigationCategory[] = [];

  for (const category of includedCategories) {
    const node = nodes.get(category.id);

    if (!node) {
      continue;
    }

    const parentId = category.parentId;
    const parent = parentId ? nodes.get(parentId) : undefined;

    if (
      parent &&
      parent.id !== node.id &&
      parentId &&
      !wouldCreateCycle(node.id, parentId, parentById)
    ) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortTree(
    items: NavigationCategory[],
  ): NavigationCategory[] {
    return items
      .sort((a, b) => {
        const sortDifference = a.sortOrder - b.sortOrder;
        return sortDifference || a.name.localeCompare(b.name);
      })
      .map((category) => ({
        ...category,
        children: sortTree(category.children),
      }));
  }

  return sortTree(roots);
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(
    request,
    "categories",
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedType = clean(
      searchParams.get("type"),
    ).toLowerCase();

    const listingType = parseListingType(requestedType);

    if (!listingType) {
      return jsonError(
        "Category type must be all, product or service.",
        400,
        rateLimit.headers,
      );
    }

    const includeEmptyValue = clean(
      searchParams.get("includeEmpty"),
    ).toLowerCase();

    const includeEmpty =
      includeEmptyValue === "true" ||
      includeEmptyValue === "1" ||
      includeEmptyValue === "yes";

    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        name: true,
        iconKey: true,
        imageUrl: true,
        parentId: true,
        isActive: true,
        sortOrder: true,
        _count: {
          select: {
            products: {
              where: {
                status: BusinessStatus.ACTIVE,
                deletedAt: null,
                business: {
                  is: {
                    status: BusinessStatus.ACTIVE,
                    deletedAt: null,
                  },
                },
              },
            },
            services: {
              where: {
                status: BusinessStatus.ACTIVE,
                deletedAt: null,
                business: {
                  is: {
                    status: BusinessStatus.ACTIVE,
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
      },
    });

    const inheritedCounts = await Promise.all(
      categories.map(async (category) => {
        const [products, services] = await Promise.all([
          listingType !== "service"
            ? prisma.product.count({
                where: buildInheritedProductCategoryWhere(
                  category.name,
                ),
              })
            : Promise.resolve(0),
          listingType !== "product"
            ? prisma.service.count({
                where: buildInheritedServiceCategoryWhere(
                  category.name,
                ),
              })
            : Promise.resolve(0),
        ]);

        return {
          id: category.id,
          products,
          services,
        };
      }),
    );

    const inheritedCountById = new Map(
      inheritedCounts.map((item) => [item.id, item]),
    );

    const baseCategories: FormattedCategory[] = categories.map(
      (category) => {
        const inherited = inheritedCountById.get(category.id);
        const productCount =
          category._count.products + (inherited?.products ?? 0);
        const serviceCount =
          category._count.services + (inherited?.services ?? 0);

        return {
          id: category.id,
          name: category.name,
          iconKey: category.iconKey,
          imageUrl: category.imageUrl,
          parentId: category.parentId,
          isActive: category.isActive,
          sortOrder: category.sortOrder,
          _count: {
            products: productCount,
            services: serviceCount,
            totalListings: productCount + serviceCount,
          },
        };
      },
    );

    const formattedCategories = aggregateDescendantCounts(
      baseCategories,
    );

    const responseCategories = includeEmpty
      ? formattedCategories
      : formattedCategories.filter((category) =>
          hasListingsForType(category, listingType),
        );

    const navigationCategories = buildNavigationTree(
      formattedCategories,
      includeEmpty,
      listingType,
    );

    return NextResponse.json(
      {
        type: listingType,
        includeEmpty,
        categories: responseCategories,
        navigationCategories,
        total: responseCategories.length,
        navigationTotal: navigationCategories.length,
      },
      {
        headers: responseHeaders(
          rateLimit.headers,
          includeEmpty ? NO_STORE : CACHE_CONTROL,
        ),
      },
    );
  } catch (error) {
    console.error("Categories API error:", error);

    return jsonError(
      "Unable to load categories.",
      500,
      rateLimit.headers,
    );
  }
}
