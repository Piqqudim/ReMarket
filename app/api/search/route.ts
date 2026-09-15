import { NextRequest, NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import {parseQuery,findMatches} from "@/lib/matching";
import { error } from "console";


export async function GET(req: NextRequest){
    try{
    const {searchParams} = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const location = searchParams.get("location")?.trim() || undefined;

    const budgetParam = searchParams.get("budget");

    const budget = budgetParam ? Number(budgetParam) : undefined;

    if(!q){
        return NextResponse.json({results: []});
    }
    if(budget !== undefined && (!Number.isFinite(budget) || budget < 0)){
        return NextResponse.json({
            error: "Invalid budget",
        }, {
            status: 400
        }
    );
    }
    
    const parsed = parseQuery(q,location,budget);

    const matches = await findMatches(parsed,30);
    if (matches.length=== 0){
        /**
         * Search analytics should not prevent
         * a valid search response
         */
        try {
            await prisma.searchEvent.create({
                data:{
                    query:q,
                    location,
                    resultCount: 0,
                },
            });
        } catch(error){
            console.error("Failed to record search event",error);
        }
        return NextResponse.json({results : []});

    }
    const businesses = await prisma.business.findMany({
        where: {
            id: {
                in: matches.map((match)=> match.businessId),
            },
            status: "ACTIVE"
        },
        include: {
            location: true,

            products: {
                where: {
                    status: "ACTIVE",
                }, 
                orderBy: {
                    updatedAt: "desc"
                }
            },
            socialLinks: true,
            categories: {
                include: {
                    category: true,
                },
            },
        },
    });

    /**
     * Prisma's in query does not guarantee
     * the same order  as our matching scores
     * Rebuild the order from matches
     * 
     */
    const businessMap = new Map(
        businesses.map((business) => [
            business.id,
            business,
        ])
    );

    const ordered = matches.map((match) => businessMap.get(match.businessId)).filter((business): business is NonNullable<typeof business> => Boolean(business));
    /**
     * Analytics should never break search
     */
    try{
        await prisma.searchEvent.create({
            data: {
                query: q,
                location,
                resultCount: ordered.length,
            },
        });
    } catch (error) {
        console.error(
            "Failed to record search event:", error
        );
    }
    return NextResponse.json({
        results: ordered,
    });
   }catch(error){
    console.error("Search API error:",error);
    return NextResponse.json({
        error:"Unable to search right now",
    }, {
        status:500
    });
}
}

