import { NextRequest,NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import { error } from "console";

export async function GET(_req: NextRequest,{params}:{params:Promise<{id: string;}>}){
    try {
        const {id} = await params;
        if(!id){
            return NextResponse.json({
                error:"Business id is required"
            },
        {
            status: 400
        });
        }
        const business = await prisma.business.findUnique({
            where:{
                id,
                status:"ACTIVE",
            },
            include:{
                location:true,

                products: {
                    where: {
                        status:"ACTIVE"
                    },
                    orderBy: {
                        updatedAt:"desc"
                    },
                },
                socialLinks:true,
                categories: {
                    include: {
                        category: true
                    },
                },
            },
        });

        if(!business){
            return NextResponse.json({
                error: " Business not found"
            },
        {
            status: 404
        });
        }
        return NextResponse.json({business});
    } catch(error){
        console.error("Business detail API error", error);
        return NextResponse.json({
            error:"Unable to load business"
        }, {
            status:500
        });
    }
   


}