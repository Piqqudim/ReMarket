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

function tokenize(value: string): string[] {
  return normalize(value)
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

  if (normalizedSuffix === "k") {
    multiplier = 1_000;
  } else if (normalizedSuffix === "m") {
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

  let location = explicitLocation
    ? normalize(explicitLocation)
    : undefined;

  let budget = explicitBudget;

  let budgetIsUpperBound = false;

  const category = explicitCategory
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

  const locationMatch = text.match(
    /\b(?:near|in|at|around)\s+([a-z][a-z0-9\s-]*?)(?=\s+(?:under|below|less|budget|for)\b|$)/
  );

  if (!location && locationMatch?.[1]) {
    location = normalize(
      locationMatch[1]
    );
  }

  if (locationMatch) {
    text = text.replace(
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

  const budgetMatch = text.match(
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

    if (parsedBudget != null) {
      budget = parsedBudget;

      const qualifier =
        budgetMatch[1].toLowerCase();

      budgetIsUpperBound =
        qualifier === "under" ||
        qualifier === "below" ||
        qualifier === "less than" ||
        qualifier === "up to" ||
        qualifier === "upto" ||
        qualifier === "max" ||
        qualifier === "maximum";
    }
  }

  if (budgetMatch) {
    text = text.replace(
      budgetMatch[0],
      " "
    );
  }

  const keywords = tokenize(text);

  return {
    keywords,
    location,
    budget,
    category,
    budgetIsUpperBound,
  };
}

function containsWord(
  text: string,
  word: string
): boolean {
  const words = tokenize(text);

  return words.some(
    (item) =>
      item === word ||
      item.startsWith(word) ||
      word.startsWith(item)
  );
}

function containsPhrase(
  text: string,
  phrase: string
): boolean {
  const normalizedText =
    normalize(text);

  const normalizedPhrase =
    normalize(phrase);

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

export async function findMatches(
  parsed: ParsedQuery
) {
  const businesses =
    await prisma.business.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
      },

      include: {
        location: true,

        categories: {
          include: {
            category: true,
          },
        },

        products: {
          where: {
            status: "ACTIVE",
            deletedAt: null,
          },
        },
      },
    });

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
              businessArea &&
              containsPhrase(
                businessArea,
                parsed.location!
              )
            );
          }
        )
      : businesses;

  const meaningfulKeywords =
    parsed.keywords.filter(
      (keyword) =>
        !GENERIC_WORDS.has(keyword)
    );

  const searchKeywords =
    meaningfulKeywords.length > 0
      ? meaningfulKeywords
      : parsed.keywords;

  const queryPhrase =
    searchKeywords.join(" ");

  const normalizedCategory =
    normalize(parsed.category);

  const matches =
    locationFiltered
      .map((business) => {
        const businessName =
          normalize(business.name);

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
            .join(" ");

        const productNames =
          business.products
            .map((product) =>
              normalize(product.name)
            )
            .join(" ");

        const productDescriptions =
          business.products
            .map((product) =>
              normalize(
                product.description
              )
            )
            .join(" ");

        const productKeywords =
          business.products
            .flatMap(
              (product) =>
                product.keywords ?? []
            )
            .map(normalize)
            .join(" ");

        const searchableText = [
          businessName,
          description,
          categoryNames,
          productNames,
          productDescriptions,
          productKeywords,
        ].join(" ");

        let score = 0;
        let keywordHits = 0;

        /*
         * Strong business-name phrase match.
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
         * Match individual query terms.
         */

        for (const keyword of searchKeywords) {
          if (!keyword) {
            continue;
          }

          if (
            containsWord(
              businessName,
              keyword
            )
          ) {
            score += 45;
            keywordHits += 1;
            continue;
          }

          if (
            containsWord(
              productNames,
              keyword
            )
          ) {
            score += 35;
            keywordHits += 1;
            continue;
          }

          if (
            containsWord(
              categoryNames,
              keyword
            )
          ) {
            score += 25;
            keywordHits += 1;
            continue;
          }

          if (
            containsWord(
              productDescriptions,
              keyword
            ) ||
            containsWord(
              productKeywords,
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
         * If a query exists but nothing
         * matched, this business is not
         * considered a match.
         *
         * A location-only query is allowed
         * because the location filter above
         * already provides the constraint.
         */

        if (
          searchKeywords.length > 0 &&
          keywordHits === 0
        ) {
          return null;
        }

        /*
         * Explicit category bonus.
         */

        if (normalizedCategory) {
          if (
            containsWord(
              categoryNames,
              normalizedCategory
            )
          ) {
            score += 30;
          }
        }

        /*
         * Location bonus.
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
         * Budget bonus.
         *
         * Upper-bound queries such as:
         * "under 50k"
         * "below 100k"
         * "up to 200k"
         *
         * are treated as maximum budgets.
         *
         * For normal budget values, the budget
         * must fall within the known product range.
         */

        const parsedBudget =
          parsed.budget;

        if (parsedBudget != null) {
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
                 * minimum known price does not
                 * exceed the buyer's maximum.
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
                 * The buyer's budget falls within
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

          if (hasAffordableProduct) {
            score += 25;
          }
        }

        /*
         * Business availability bonus.
         */

        if (
          business.availability ===
          "AVAILABLE"
        ) {
          score += 8;
        } else if (
          business.availability ===
          "ASK_SELLER"
        ) {
          score += 3;
        }

        /*
         * Verification bonus.
         */

        if (
          business.verification ===
          "VERIFIED"
        ) {
          score += 5;
        }

        return {
          business,
          score,
        };
      })
      .filter(
        (
          item
        ): item is {
          business: (typeof businesses)[number];
          score: number;
        } => item !== null
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  return matches;
}