import { NextRequest, NextResponse } from "next/server";
import {prisma} from "@/lib/prisma";
import { haversineDistance } from "@/lib/distance";

export async function GET(req: NextRequest){
    try{
        const {searchParams} = new URL(req.url);
        const latValue = searchParams.get("lat");
        const lngValue = searchParams.get("lng");

        const lat = latValue ? Number(latValue): NaN;
        const lng = lngValue ? Number(lngValue): NaN;

        const hasCoordinate = Number.isFinite(lat) && Number.isFinite(lng);

        const businesses = await prisma.business.findMany({
            where: {
                status:"ACTIVE",
            },
            include:{
                location: true,

                products: {
                    where:{
                        status:"ACTIVE",
                    },
                },
                categories:{
                    include:{
                        category:true,
                    },
                },
                socialLinks: true
            },
        });

        const cards = businesses.map((business)=> {
            const businessLat = business.location?.lat;
            const businessLng = business.location?.long;

            const hasBusinessCoordinates  = typeof businessLat === "number" && typeof businessLng === "number";

            const distanceKm = hasCoordinate && hasBusinessCoordinates ? haversineDistance(lat,lng,businessLat,businessLng): null;
            let directionsUrl: string | null = null;

            if(hasBusinessCoordinates){
                directionsUrl = `https://www.google.com/maps/dir/?api=1`+ `&destination=${businessLat},${businessLng}`;
            } else if(business.location?.area){
                directionsUrl = `https://www.google.com/maps/search/?api=1` + `&query=${encodeURIComponent(business.location.area)}`
            }
            return {
                id: business.id,
                name: business.name,
                area: business.location?.area ?? null,
                distanceKm: distanceKm != null ? Math.round(distanceKm * 10)/ 10 : null,
                category: business.categories[0]?.category.name ?? null,
                productCount: business.products.length,
                verified: business.verification === "UNVERIFIED",
                availability: business.availability,
                whatsapp: business.socialLinks.find((social)=> social.platform === "WHATSAPP")?.handle ?? null,
                phone: business.phone ?? null,
                directionsUrl,
            };
        }).sort((a, b) => {
            if(
                a.distanceKm === null && b.distanceKm === null
            ){
                return a.name.localeCompare(b.name);
            }
            if(a.distanceKm === null) return 1;
            if (b.distanceKm === null ) return -1;
            return a.distanceKm - b.distanceKm;
        });
        return NextResponse.json({
            businesses:cards,
        });
    } catch(error){
        console.error("Near-me API error:", error);
        return NextResponse.json({
            businesses:[],
            error:"Unable to load nearby businesses"
        },{
            status:500
        }
    );
    }
}