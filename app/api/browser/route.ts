import { NextRequest,NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const {searchParams} = new URL(req.url);
    const category = searchParams.get("category");
    const q = searchParams.get("q");

    const businesses = await prisma.business.findMany({
        where: {
            status:"ACTIVE",
            ...(category ? {categories:{ some: {category:{name:category}}}} : {} ),
            ...(q? {name:{contains:q, mode:"insensitive"}}:{}),
        },
        include: {
            location: true,
            products: {where: {status:"ACTIVE"},take:1,orderBy:{updatedAt:"desc"}},
            categories:{include:{category:true}},
            socialLinks: true,
        },
        take:40
    });

    return NextResponse.json({businesses});
    
}
