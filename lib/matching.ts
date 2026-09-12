import {prisma} from "./prisma";

export interface ParsedQuery {
    keywords: string[];
    categoryGuess?: string;
    location?: string;
    budget?: number;
}

export function parseQuery(raw: string, explicitLocation?: string, explicitBudget?: number): ParsedQuery{
    const text = raw.toLowerCase().trim();
    const locationWords = ["near", "in", "at", "around"];
    let location = explicitLocation;
    let cleaned = text;

    for (const w of locationWords){
        const idx = text.indexOf(`${w}`);
        if (idx !== -1 && !location){
            location = text.slice(idx + w.length + 2).trim();
            cleaned = text.slice(0, idx);
        }
    }
    const keywords = cleaned.replace(/[^\w\s]/g,"").split(/\s+/).filter((w) => w.length > 1);
    return { keywords,location,budget:explicitBudget};

    
}

interface MatchCandidate {
    businessId: string;
    score: number;
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
    for (const biz of businesses){
        let score = 0;
        const haystack = [
            biz.name,
            biz.description ?? "",...biz.categories.map((c)=>c.category.name),
            ...biz.products.flatMap((p)=>[p.name,p.description?? "",...p.keywords])
        ].join("").toLowerCase();
        let keywordHits=0;
        for(const kw of parsed.keywords){
            if(haystack.includes(kw)) keywordHits++;

        }
        if(keywordHits==0) continue;
        score+= keywordHits*10;
        if(parsed.location && biz.location?.area.toLowerCase().includes(parsed.location)){
            score += 15;

        }
        if(parsed.budget){
            const inRange=biz.products.some((p)=>(p.priceMin?? p.price?? 0)<=parsed.budget! &&(p.priceMax ?? p.price?? Infinity)>= parsed.budget!*0.5);
            if(inRange) score+=10;
        }
        if(biz.availability==="AVAILABLE"){
            score+=8;
        }
        else if(biz.availability==="ASK_SELLER") score+= 5;
        scored.push({businessId:biz.id, score});
        
    }
    return scored.sort((a,b)=>b.score-a.score).slice(0,limit);
    
}