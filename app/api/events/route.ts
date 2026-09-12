import {NextRequest,NextResponse} from "next/server";
import {prisma} from  "@/lib/prisma";

export async function POST(req: NextRequest){
    const {businessId, requestId,platform} = await req.json();
    if(!businessId || !platform){
        return NextResponse.json({error:"businessId and platform required "}, {status: 400});
    }

    const event = await prisma.contactEvent.create({
        data: {businessId, requestId,platform},
    });
    return NextResponse.json({event});
}