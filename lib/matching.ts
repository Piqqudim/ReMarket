import {prisma} from "./prisma";

export interface ParsedQuery {
    keywords: string[];
    location?: string;
    budget?: number;
}
interface MatchCandidate{
    businessId: string;
    score: number;
}

function normalize(value: string):string {
    return value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu,"").replace(/\s+/g,"");

}

function tokenize(value: string): string[]{
    return normalize(value).split("").filter((word) => word.length > 1);
}

export function parseQuery(raw: string, explicitLocation?: string, explicitBudget?: number): ParsedQuery{
    const text = normalize(raw);
    let location = explicitLocation?.trim() || undefined;
    let cleaned = text;

    /**
     * Examples:
     * "Shoes near ikeja"
     * "bags in yaba"
     * "phones around surulere"
     */
    const locationPattern = /\s+(?:near|in|at|around)\s+(.+)$/i;
    if(!location){
        const match = text.match(locationPattern);
        if(match?.[1]){
            location = match[1].trim();
            cleaned = text.slice(0,match.index).trim();
        }
    }
    const keywords = tokenize(cleaned);

    return {
        keywords:[...new Set(keywords)],
        location: location ? normalize(location): undefined,
        budget: typeof explicitBudget === "number" && Number.isFinite(explicitBudget) && explicitBudget > 0 ? explicitBudget: undefined,
    };   
}


export async function findMatches(parsed: ParsedQuery, limit = 20): Promise<MatchCandidate[]>{
    const businesses = await prisma.business.findMany({
        where: { status:"ACTIVE"},
        include : {
            products: true,
            categories: { include: { category: true}},
            location: true,
        },
    });
    const scored: MatchCandidate[] = [];

    for(const business of businesses){
        const searchableText = [
            business.name,
            business.description ?? "",
            ...business.categories.map((item) => item.category.name),
            ...business.products.flatMap((product) => [
                product.name,
                product.description ?? "",
                ...product.keywords,
            ]),
        ].join("");

        const haystackTokens = new Set(tokenize(searchableText));
        let score = 0;
        let hits = 0;
        /**
         * Keyword relevance
         */
        for(const keyword of parsed.keywords){
            if(haystackTokens.has(keyword)){
                hits++;
            }
        }
        if(hits === 0){
            continue;
        }
        score += hits * 10;

        /**
         * Exact business-name / category relevance
         */
        const normalizedName = normalize(business.name);
        if(parsed.keywords.some((keyword) =>
            normalizedName.includes(keyword)
        )){
            score +=8;
        }
        /**
         * Location relevance
         */
        const businessArea = normalize(business.location?.area?? "");
        if(parsed.location && businessArea.includes(parsed.location)){
            score += 15;
        }
        /**
         * Budget relevance
         */
        if(parsed.budget !== undefined){
            const budget = parsed.budget;

            const hasBudgetMatch = business.products.some((product) => {
                const min = product.priceMin ?? product.price ?? 0;
                const max = product.priceMax ?? product.price ?? Infinity;
                return (
                    min <= budget && max >= budget * 0.5
                );
            });

            if (hasBudgetMatch){
                score += 10;
            }
        }
        /**
         * Availability
         */
        if(business.availability === "AVAILABLE"){
            score += 8;
        } else if( business.availability === "ASK_SELLER"){
            score += 3;
        }

        /**
         * Verification
         */
        if(business.verification === "VERIFIED"){
            score += 5;
        }
        scored.push({businessId:business.id, score});
    }
    return scored.sort((a,b) => b.score - a.score).slice(0, Math.max(1, limit));
   
    
}