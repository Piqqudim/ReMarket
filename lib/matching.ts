import {
  Availability,
  Prisma,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ParsedQuery = {
  keywords: string[];
  location?: string;
  budget?: number;
  category?: string;
  budgetIsUpperBound?: boolean;
};

const GENERIC_WORDS = new Set([
  "store",
  "stores",
  "shop",
  "shops",
  "seller",
  "sellers",
  "business",
  "businesses",
  "item",
  "items",
  "product",
  "products",
  "thing",
  "things",
  "buy",
  "buying",
  "find",
  "looking",
  "need",
  "want",
  "please",
  "me",
  "for",
  "a",
  "an",
  "the",
]);

function normalize(
  value: string | null | undefined
): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(
  value: string
): string[] {
  const normalized =
    normalize(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .filter(Boolean);
}

function parseBudgetAmount(
  value: string,
  suffix?: string
): number | null {
  const numericValue = Number(
    value.replace(/,/g, "")
  );

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const normalizedSuffix =
    suffix?.toLowerCase();

  let multiplier = 1;

  if (
    normalizedSuffix === "k"
  ) {
    multiplier = 1_000;
  } else if (
    normalizedSuffix === "m"
  ) {
    multiplier = 1_000_000;
  }

  const result =
    numericValue * multiplier;

  return Number.isFinite(result)
    ? result
    : null;
}

export function parseQuery(
  raw: string,
  explicitLocation?: string,
  explicitBudget?: number,
  explicitCategory?: string
): ParsedQuery {
  let text = normalize(raw);

  let location =
    explicitLocation
      ? normalize(explicitLocation)
      : undefined;

  let budget =
    explicitBudget;

  let budgetIsUpperBound =
    false;

  const category =
    explicitCategory
      ? normalize(explicitCategory)
      : undefined;

  /*
   * -----------------------------------------
   * LOCATION
   * -----------------------------------------
   *
   * Only treat text beginning with a letter
   * as a location. This prevents phrases such
   * as "phone at 50k" from treating "50k"
   * as a location.
   */

  const locationMatch =
    text.match(
      /\b(?:near|in|at|around)\s+([a-z][a-z0-9\s-]*?)(?=\s+(?:under|below|less|budget|for)\b|$)/
    );

  if (
    !location &&
    locationMatch?.[1]
  ) {
    location =
      normalize(
        locationMatch[1]
      );
  }

  if (locationMatch) {
    text =
      text.replace(
        locationMatch[0],
        " "
      );
  }

  /*
   * -----------------------------------------
   * BUDGET
   * -----------------------------------------
   *
   * Supports examples such as:
   *
   * under 50k
   * below ₦50,000
   * less than 100k
   * budget of 200k
   * up to 150k
   * maximum 300k
   */

  const budgetMatch =
    text.match(
      /\b(under|below|less than|budget(?: of)?|up to|upto|max(?:imum)?)\s*[₦n]?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:naira)?\b/
    );

  if (
    budget == null &&
    budgetMatch?.[2]
  ) {
    const parsedBudget =
      parseBudgetAmount(
        budgetMatch[2],
        budgetMatch[3]
      );

    if (
      parsedBudget != null
    ) {
      budget =
        parsedBudget;

      const qualifier =
        budgetMatch[1].toLowerCase();

      budgetIsUpperBound =
        qualifier === "under" ||
        qualifier === "below" ||
        qualifier ===
          "less than" ||
        qualifier ===
          "up to" ||
        qualifier ===
          "upto" ||
        qualifier === "max" ||
        qualifier ===
          "maximum";
    }
  }

  if (budgetMatch) {
    text =
      text.replace(
        budgetMatch[0],
        " "
      );
  }

  const keywords =
    tokenize(text);

  return {
    keywords,
    location,
    budget,
    category,
    budgetIsUpperBound,
  };
}

/*
 * ------------------------------------------------
 * MATCHING BUSINESS TYPE
 * ------------------------------------------------
 *
 * This represents only the fields the matching
 * engine actually needs.
 *
 * Keeping this smaller also prevents the fallback
 * database query from loading unnecessary business,
 * product-image, or social-link data.
 */

export type MatchingBusiness =
  Prisma.BusinessGetPayload<{
    select: {
      id: true;
      name: true;
      description: true;
      availability: true;
      verification: true;

      location: {
        select: {
          area: true;
        };
      };

      categories: {
        select: {
          category: {
            select: {
              name: true;
            };
          };
        };
      };

      products: {
        where: {
          status: "ACTIVE";
          deletedAt: null;
        };

        select: {
          name: true;
          description: true;
          keywords: true;
          price: true;
          priceMin: true;
          priceMax: true;
        };
      };
    };
  }>;

function containsWordTokens(
  tokens: readonly string[],
  word: string
): boolean {
  return tokens.some(
    (item) =>
      item === word ||
      item.startsWith(word) ||
      word.startsWith(item)
  );
}

function containsPhrase(
  normalizedText: string,
  normalizedPhrase: string
): boolean {
  if (
    !normalizedText ||
    !normalizedPhrase
  ) {
    return false;
  }

  return normalizedText.includes(
    normalizedPhrase
  );
}

/*
 * ------------------------------------------------
 * SEARCHABLE BUSINESS CACHE
 * ------------------------------------------------
 *
 * Values are normalized once per business rather
 * than repeatedly for every keyword.
 */

type SearchableBusiness = {
  business: MatchingBusiness;

  businessName: string;
  businessNameTokens: string[];

  description: string;
  categoryNames: string;
  categoryTokens: string[];

  productNames: string;
  productNameTokens: string[];

  productDescriptions: string;
  productDescriptionTokens: string[];

  productKeywords: string;
  productKeywordTokens: string[];

  searchableText: string;
};

function buildSearchableBusiness(
  business: MatchingBusiness
): SearchableBusiness {
  const businessName =
    normalize(
      business.name
    );

  const description =
    normalize(
      business.description
    );

  const categoryNames =
    business.categories
      .map((item) =>
        normalize(
          item.category.name
        )
      )
      .filter(Boolean)
      .join(" ");

  const productNames =
    business.products
      .map((product) =>
        normalize(
          product.name
        )
      )
      .filter(Boolean)
      .join(" ");

  const productDescriptions =
    business.products
      .map((product) =>
        normalize(
          product.description
        )
      )
      .filter(Boolean)
      .join(" ");

  const productKeywords =
    business.products
      .flatMap(
        (product) =>
          product.keywords ??
          []
      )
      .map(normalize)
      .filter(Boolean)
      .join(" ");

  const searchableText = [
    businessName,
    description,
    categoryNames,
    productNames,
    productDescriptions,
    productKeywords,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    business,

    businessName,
    businessNameTokens:
      tokenize(businessName),

    description,

    categoryNames,
    categoryTokens:
      tokenize(categoryNames),

    productNames,
    productNameTokens:
      tokenize(productNames),

    productDescriptions,
    productDescriptionTokens:
      tokenize(productDescriptions),

    productKeywords,
    productKeywordTokens:
      tokenize(productKeywords),

    searchableText,
  };
}

/*
 * ------------------------------------------------
 * DATABASE FALLBACK
 * ------------------------------------------------
 *
 * This is used by /api/request and any other caller
 * that doesn't already have the searchable businesses.
 *
 * IMPORTANT:
 * /api/search should pass its already-loaded business
 * list into findMatches() so this query is not repeated.
 */

async function loadMatchingBusinesses(): Promise<
  MatchingBusiness[]
> {
  return prisma.business.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
    },

    select: {
      id: true,
      name: true,
      description: true,
      availability: true,
      verification: true,

      location: {
        select: {
          area: true,
        },
      },

      categories: {
        select: {
          category: {
            select: {
              name: true,
            },
          },
        },
      },

      products: {
        where: {
          status: "ACTIVE",
          deletedAt: null,
        },

        select: {
          name: true,
          description: true,
          keywords: true,
          price: true,
          priceMin: true,
          priceMax: true,
        },
      },
    },
  });
}

export async function findMatches(
  parsed: ParsedQuery,
  candidateBusinesses?: readonly MatchingBusiness[]
) {
  /*
   * If a caller already loaded the searchable
   * businesses, use those records directly.
   *
   * This is the key protection against the duplicate
   * full database read in /api/search.
   */
  const businesses =
    candidateBusinesses ??
    (await loadMatchingBusinesses());

  /*
   * -----------------------------------------
   * LOCATION FILTER
   * -----------------------------------------
   *
   * A location contained in the search query
   * is treated as an actual search constraint,
   * not merely as a ranking bonus.
   */

  const locationFiltered =
    parsed.location
      ? businesses.filter(
          (business) => {
            const businessArea =
              normalize(
                business.location?.area
              );

            return (
              Boolean(businessArea) &&
              containsPhrase(
                businessArea,
                parsed.location!
              )
            );
          }
        )
      : businesses;

  const searchableBusinesses =
    locationFiltered.map(
      buildSearchableBusiness
    );

  const meaningfulKeywords =
    parsed.keywords.filter(
      (keyword) =>
        !GENERIC_WORDS.has(
          keyword
        )
    );

  const searchKeywords =
    meaningfulKeywords.length >
    0
      ? meaningfulKeywords
      : parsed.keywords;

  const queryPhrase =
    searchKeywords.join(" ");

  const normalizedCategory =
    normalize(parsed.category);

  const matches =
    searchableBusinesses
      .map(
        ({
          business,
          businessName,
          businessNameTokens,
          categoryNames,
          categoryTokens,
          productNames,
          productNameTokens,
          productDescriptionTokens,
          productKeywordTokens,
          searchableText,
        }) => {
          let score = 0;
          let keywordHits = 0;

          /*
           * -----------------------------------------
           * BUSINESS NAME PHRASE MATCH
           * -----------------------------------------
           */

          if (
            queryPhrase &&
            containsPhrase(
              businessName,
              queryPhrase
            )
          ) {
            score += 100;
            keywordHits += 1;
          }

          /*
           * -----------------------------------------
           * INDIVIDUAL KEYWORD MATCHING
           * -----------------------------------------
           */

          for (
            const keyword of
            searchKeywords
          ) {
            if (!keyword) {
              continue;
            }

            if (
              containsWordTokens(
                businessNameTokens,
                keyword
              )
            ) {
              score += 45;
              keywordHits += 1;
              continue;
            }

            if (
              containsWordTokens(
                productNameTokens,
                keyword
              )
            ) {
              score += 35;
              keywordHits += 1;
              continue;
            }

            if (
              containsWordTokens(
                categoryTokens,
                keyword
              )
            ) {
              score += 25;
              keywordHits += 1;
              continue;
            }

            if (
              containsWordTokens(
                productDescriptionTokens,
                keyword
              ) ||
              containsWordTokens(
                productKeywordTokens,
                keyword
              )
            ) {
              score += 20;
              keywordHits += 1;
              continue;
            }

            if (
              searchableText.includes(
                keyword
              )
            ) {
              score += 10;
              keywordHits += 1;
            }
          }

          /*
           * -----------------------------------------
           * NO KEYWORD MATCH
           * -----------------------------------------
           *
           * A query with keywords requires at
           * least one keyword hit.
           *
           * A location-only query is allowed because
           * the location filter already provides the
           * search constraint.
           */

          if (
            searchKeywords.length >
              0 &&
            keywordHits === 0
          ) {
            return null;
          }

          /*
           * -----------------------------------------
           * CATEGORY BONUS
           * -----------------------------------------
           */

          if (
            normalizedCategory
          ) {
            if (
              containsWordTokens(
                categoryTokens,
                normalizedCategory
              )
            ) {
              score += 30;
            }
          }

          /*
           * -----------------------------------------
           * LOCATION BONUS
           * -----------------------------------------
           */

          if (parsed.location) {
            const businessArea =
              normalize(
                business.location?.area
              );

            if (
              businessArea &&
              containsPhrase(
                businessArea,
                parsed.location
              )
            ) {
              score += 35;
            }
          }

          /*
           * -----------------------------------------
           * BUDGET BONUS
           * -----------------------------------------
           */

          const parsedBudget =
            parsed.budget;

          if (
            parsedBudget != null
          ) {
            const hasAffordableProduct =
              business.products.some(
                (product) => {
                  const min =
                    product.priceMin ??
                    product.price;

                  const max =
                    product.priceMax ??
                    product.price;

                  /*
                   * No price information:
                   * do not award a budget bonus.
                   */
                  if (
                    min == null &&
                    max == null
                  ) {
                    return false;
                  }

                  /*
                   * Upper-bound budget.
                   *
                   * A product qualifies when its
                   * minimum known price does not exceed
                   * the buyer's maximum.
                   */
                  if (
                    parsed.budgetIsUpperBound
                  ) {
                    if (
                      min != null &&
                      parsedBudget < min
                    ) {
                      return false;
                    }

                    return true;
                  }

                  /*
                   * Normal budget.
                   *
                   * The buyer's budget falls inside
                   * the product's known price range.
                   */
                  if (
                    min != null &&
                    parsedBudget < min
                  ) {
                    return false;
                  }

                  if (
                    max != null &&
                    parsedBudget > max
                  ) {
                    return false;
                  }

                  return true;
                }
              );

            if (
              hasAffordableProduct
            ) {
              score += 25;
            }
          }

          /*
           * -----------------------------------------
           * AVAILABILITY BONUS
           * -----------------------------------------
           */

          if (
            business.availability ===
            Availability.AVAILABLE
          ) {
            score += 8;
          } else if (
            business.availability ===
            Availability.ASK_SELLER
          ) {
            score += 3;
          }

          /*
           * -----------------------------------------
           * VERIFICATION BONUS
           * -----------------------------------------
           */

          if (
            business.verification ===
            VerificationStatus.VERIFIED
          ) {
            score += 5;
          }

          return {
            business,
            score,
          };
        }
      )
      .filter(
        (
          item
        ): item is {
          business: MatchingBusiness;
          score: number;
        } =>
          item !== null
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  return matches;
}