import { NextRequest, NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import {parseQuery,findMatches} from "@/lib/matching";


export async function GET(req: NextRequest){
    const {searchParams} = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const location = searchParams.get("location") ?? undefined;

    if(!q.trim()){
        return NextResponse.json({results:[]});
    }

    const parsed = parseQuery(q,location);
    const matches = await findMatches(parsed, 30);

    const businesses = await prisma.business.findMany({
        where: {id: {in: matches.map((m) => m.businessId)}},
        include: {location:true, products:true, socialLinks:true, categories: {include: {category:true}}},
    });
    const ordered = matches.map((m) => businesses.find((b)=>b.id === m.businessId)).filter(Boolean);
    await prisma.searchEvent.create({
        data: {query:q, location, resultCount:ordered.length},
    })
    return NextResponse.json({results: ordered});
}