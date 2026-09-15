import { NextResponse,NextRequest } from "next/server";
import {prisma} from "@/lib/prisma";

export async function GET(){
    try {
    const categories = await prisma.category.findMany({
        include: {_count: {select:{business:true}}},
        orderBy:{name:"asc"},
    });
    return NextResponse.json({categories});
    }catch(error){
        console.error("Failed to fetch categories:", error);

        return NextResponse.json({
            error:"Failed to fetch categories"
        }, {
            status: 500
        });
    }
}