"use client";
import { buildContactUrl, ContactPlatform } from "@/lib/social-links";
const PLATFORM_LABEL: Record<ContactPlatform,string> ={
    WHATSAPP: "Whatsapp",
    INSTAGRAM: "Instagram",
    TIKTOK: "Tiktok",
    FACEBOOK: "Facebook",
    PHONE: "Call",
    DIRECTIONS: "Directions"

};
interface ContactButtonProps{
    platform: ContactPlatform,
    handle: string;
    onClick? : ()=> void;
}

export default function ContactButton({platform, handle,onClick}: ContactButtonProps){
    const isWhatsapp = platform === "WHATSAPP";
    const isPhone = platform === "PHONE";

    const href = buildContactUrl(platform,handle);
    if(href === "#"){
        return null;
    }
    return (
        <a 
            href={href}
            target={isPhone ? undefined: "_blank"}
            rel={isPhone ? undefined: "noopener noreferrer"}
            onClick={onClick}
            className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition ${
                isWhatsapp? "bg-green-600 text-white hover:bg-green-700": "border border-gray-300 bg-white text-gray-700 hover: bg-gray-50"}`}
                >
                    {PLATFORM_LABEL[platform]}
                </a>
    );
}
    
