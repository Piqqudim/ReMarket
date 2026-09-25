import { prisma } from "@/lib/prisma";

export type ParsedQuery = {
  keywords: string[];
  location?: string;
  budget?: number;
  category?: string;
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

  const category = explicitCategory
    ? normalize(explicitCategory)
    : undefined;

  const locationMatch = text.match(
    /\b(?:near|in|at|around)\s+([a-z0-9\s-]+?)(?=\s+(?:under|below|less|budget|for)\b|$)/
  );

  if (!location && locationMatch?.[1]) {
    location = normalize(locationMatch[1]);
  }

  if (locationMatch) {
    text = text.replace(
      locationMatch[0],
      " "
    );
  }

  const budgetMatch = text.match(
    /\b(?:under|below|less than|budget(?: of)?|up to|upto|max(?:imum)?)\s*₦?\s*([\d,]+)/
  );

  if (
    budget == null &&
    budgetMatch?.[1]
  ) {
    const parsedBudget = Number(
      budgetMatch[1].replace(/,/g, "")
    );

    if (Number.isFinite(parsedBudget)) {
      budget = parsedBudget;
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
  const normalizedText = normalize(text);
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

  const matches = businesses
    .map((business) => {
      const businessName =
        normalize(business.name);

      const description =
        normalize(business.description);

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
            normalize(product.description)
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
       */
      if (
        searchKeywords.length > 0 &&
        keywordHits === 0
      ) {
        return null;
      }

      /*
       * Explicit category bonus.
       *
       * Example:
       * category = Fashion
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
       * A product is affordable when the
       * buyer's budget falls within the
       * product's known price/range.
       */
      if (parsed.budget != null) {
        const hasAffordableProduct =
          business.products.some(
            (product) => {
              const min =
                product.priceMin ??
                product.price;

              const max =
                product.priceMax ??
                product.price;

              if (
                min == null &&
                max == null
              ) {
                return false;
              }

              if (
                min != null &&
                parsed.budget! < min
              ) {
                return false;
              }

              if (
                max != null &&
                parsed.budget! > max
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