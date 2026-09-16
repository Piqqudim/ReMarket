import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary} from "cloudinary";
import { error } from "console";

const MAX_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,

} = process.env;

if(!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !CLOUDINARY_CLOUD_NAME){
    throw new Error("Missing CLoudinary environment variables");
}

cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key:CLOUDINARY_API_KEY,
    api_secret:CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if(!(file instanceof File)){
            return NextResponse.json({
                error:"No valid file provided"
            },
            {
                status: 400
            }
        
        );

        }
        if(!ALLOWED_TYPES.has(file.type)){
            return NextResponse.json({
                error: " Only JPEG, PNG, and WebP images are allowed"
            }, {
                status: 400
            });
        }
        if(file.size === 0){
            return NextResponse.json({
                error:"File is empty"
            }, 
            {
                status: 400
            },
        );
        }

        if(file.size > MAX_SIZE){
            return NextResponse.json({
                error: "File too large. Maximum size is 5MB"
            }, {
                status: 400
            });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const result = await new Promise<{secure_url: string}>(
            (resolve,reject) => {
                const uploadStream = cloudinary.uploader.upload_stream({
                    folder: "ReMarket",
                    resource_type:"image",
                },
                (error, result) => {
                    if(error){
                        reject(error);
                        return;
                    }
                    if(!result){
                        reject(new Error("Cloudinary returned no result"));
                        return;
                    }
                    resolve(result);
                }
            );
            uploadStream.end(buffer);
            }
        );
        return NextResponse.json({
            url: result.secure_url
        }, {
            status: 201
        });
    } catch(error){
        console.error("Image upload failed", error);
        return NextResponse.json({
            error: "Image upload failed"
        },
        {
            status: 500
        }
    );
    }
    
}
