import {NextRequest,NextResponse} from "next/server";
import {prisma} from  "@/lib/prisma";
import { error } from "console";


const ALLOWED_PLATFORMS = new Set([
    "WHATSAPP",
    "INSTAGRAM",
    "TIKTOK",
    "FACEBOOK",
    "PHONE",
    "DIRECTIONS"
]);

export async function POST(req: NextRequest){
  try{
    const body = await req.json();

    const businessId = typeof body.businessId === "string" ? body.businessId.trim(): "";

    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : undefined ;

    const platform = typeof body.platform === "string" ?  body.platform.trim().toUpperCase(): "";

    if(businessId || !platform){
        return NextResponse.json({
            error: "businessId and platform are required",
        },
    {
        status: 400
    });
    }
    if(!ALLOWED_PLATFORMS.has(platform)){
    return NextResponse.json({
        error:"Invalid platform",

    },{
        status: 400
    });

  }
  const business = await prisma.business.findUnique({
    where:{
        id: businessId,
        status:"ACTIVE"
    },
    select:{
        id: true
    },
  });
  if(!business){
    return NextResponse.json({
        error: "Business not found"
    },{
        status: 404
    });
  }
  const event = await prisma.contactEvent.create({
    data: {
        businessId,
        requestId: requestId || undefined,
        platform,
    },
  });
  return NextResponse.json({event});
  } catch(error){
    console.error("Contact event error", error);
    return NextResponse.json({ error: "Unable to record contact event"}, {status: 500});
  }
 
}