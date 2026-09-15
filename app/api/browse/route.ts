import { NextRequest,NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";

export async function GET(req: NextRequest) {
    try{
    const {searchParams} = new URL(req.url);
    const category = searchParams.get("category")?.trim() || undefined;
    const q = searchParams.get("q")?.trim() || undefined;

    const businesses = await prisma.business.findMany({
        where: {
            status:"ACTIVE",
            ...(category ? {categories:{ some: {category:{name:category}}}} : {} ),
           ...(q ? {
            OR: [
                {name: {
                    contains: q,
                    mode: "insensitive",
                },
            },
            {
                description: {
                    contains: q,
                    mode: "insensitive"
                },
            },
            {
                products: {
                    some:{
                        status:"ACTIVE",
                        OR: [
                            {
                                name: {
                                    contains: q,
                                    mode: "insensitive",
                                },
                            },
                            {
                                description: {
                                    contains: q,
                                    mode: "insensitive",
                                },
                            },
                            {
                                keywords : {
                                    has: q.toLowerCase(),
                                },
                            },
                        ],
                    },
                },
            },
            ],
           }: {})
        },
        include: {
            location: true,
            products: {where: {status:"ACTIVE"},take:4,orderBy:{updatedAt:"desc"}},
            categories:{include:{category:true}},
            socialLinks: true,
        },
        take:40
    });

    return NextResponse.json({businesses});
} catch(error){
    console.error("Browse API error", error);
    return NextResponse.json({error: "Unable to load businesses"}, {status: 500});
}
    
}
