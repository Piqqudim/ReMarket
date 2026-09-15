import { NextRequest,NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import {parseQuery,findMatches} from "@/lib/matching";

export async function POST(req: NextRequest){
    try {
    const body = await req.json();
    const {query, categoryId, budget, locationArea,quantity, description,imageUrl, buyerContact} = body;

    if(typeof query !== "string" || !query.trim()){
        return NextResponse.json({
            error: "query is required"
        }, 
    {
        status: 400
    });
    }
    const parsedBudget = budget === undefined || budget === null || budget === "" ? undefined: Number(budget);
    if(parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget < 0)){
        return NextResponse.json({
            error: "Invalid budget",
        },
    {
        status: 400
    });

    }

    const parsedQuantity = quantity === undefined || quantity === null || quantity === "" ? 1 : Number(quantity);

    if(!Number.isInteger(parsedQuantity) || parsedQuantity < 1){
        return NextResponse.json({
            error: "Quantity must be a positive integer"
        }, {
            status: 400
        });
    }
    /**
     * Find matches before the transaction
     * 
     * The transaction itself handles the 
     * request + match records atomically
     */
    const parsed = parseQuery(query,locationArea,parsedBudget);
    const matches = await findMatches(parsed, 10);

    const request = await prisma.$transaction(async(tx)=>{
        const created = await tx.buyerRequest.create({
            data:{
                query: query.trim(),
                categoryId: categoryId || undefined,
                budget: parsedBudget,
                locationArea: locationArea?.trim() || undefined,
                quantity: parsedQuantity,
                description: description?.trim() || undefined,
                imageUrl: imageUrl?.trim() || undefined,
                buyerContact: buyerContact?.trim() || undefined,

            },
        });

        if (matches.length > 0){
            await tx.match.createMany({
                data: matches.map((match) => ({
                    requestId: created.id,
                    businessId: match.businessId,
                    score: match.score
                })),
            });
        await tx.buyerRequest.update({
            where: {
                id: created.id,
            },

            data: {
                status:"MATCHED"
            },
        });
        }
        return tx.buyerRequest.findUnique({
            where: {
                id: created.id,
            },
            include:{
                matches:{
                    orderBy:{
                        score:"desc"
                    },
                    include:{
                        business:{
                            include:{
                                location:true,
                                socialLinks:true,
                            },
                        },
                    },
                },
            },
        });
    });

    return NextResponse.json({
        request,
    });
    } catch(error){
        console.error("Request API error", error);
        return NextResponse.json({
            error: "Unable to create request right now"
        },
    {
        status: 500
    });

    }
}