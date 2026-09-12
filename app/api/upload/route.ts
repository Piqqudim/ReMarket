import { NextRequest,NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name:process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req:NextRequest){
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if(!file) return NextResponse.json({error: "no file provided"}, { status: 400});
    if(!ALLOWED_TYPES.includes(file.type)){
        return NextResponse.json({error:"only jpeg,png, webp allowed"}, {status: 400});
    }
    if(file.size > MAX_SIZE){
        return NextResponse.json({error: "file too large (max 5MB"}, {status:400});
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await new Promise<{secure_url:string}>((resolve,reject)=>{
        const uploadStream = cloudinary.uploader.upload_stream(
            {
            folder:"Remarket", resource_type:"image" },
            (error,result) => {
                if(error || !result) reject(error);
                else resolve(result);
            }
        );
        uploadStream.end(buffer);
    })
    return NextResponse.json({url:result.secure_url});
    
}
