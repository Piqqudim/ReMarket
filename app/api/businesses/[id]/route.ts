import { NextRequest,NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";

export async function GET(_req: NextRequest,{params}:{params:{id:string}}){
    const business = await prisma.business.findUnique({
        where: {id:params.id, status:"ACTIVE"},
        include: {
            location:true,
            products: {where: {status:"ACTIVE"}},
            socialLinks:true,
            categories:{include:{category:true}},
        }
    });
    if(!business) return NextResponse.json({error:"not found"}, {status:404});
    return NextResponse.json({business});


}