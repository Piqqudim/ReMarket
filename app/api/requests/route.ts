import { NextRequest,NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import {parseQuery,findMatches} from "@/lib/matching";

export async function POST(req: NextRequest){
    const body = await req.json();
    const {query, categoryId, budget, locationArea,quantity, description,imageUrl, buyerContact} = body;

    if(!query?.trim()){
        return NextResponse.json({error:"query is required"}, {status: 400});
    }

    const request = await prisma.buyerRequest.create({
        data: {query,categoryId,budget,locationArea,quantity,description,imageUrl,buyerContact},
    });

    const parsed = parseQuery(query,locationArea,budget);
    const matches = await findMatches(parsed,10);

    if (matches.length > 0){
        await prisma.match.createMany({
            data: matches.map((m) => ({
                requestId: request.id,
                businessId: m.businessId,
                score: m.score,
            })),
        });
        await prisma.buyerRequest.update({
            where: {id: request.id},
            data: {status: "MATCHED"},
        });
    }

    const full = await prisma.buyerRequest.findUnique({
        where: {id: request.id},
        include: {matches: {include: {business: {include:{location:true, socialLinks:true}}}}},
    });

    return NextResponse.json({request:full});
}