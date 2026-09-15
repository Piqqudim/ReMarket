"use client";
import { buildContactUrl } from "@/lib/social-links";
const PLATFORM_LABEL: Record<string,string> ={
    WHATSAPP: "Whatsapp",
    INSTAGRAM: "Instagram",
    TIKTOK: "Tiktok",
    FACEBOOK: "Facebook",
    PHONE: "Call",

};

export default function ContactButton({platform, handle,onClick}: {platform: string, handle: string, onClick: ()=> void;}){
    const isWhatsapp = platform == "WHATSAPP";
    return (
        <a href = {buildContactUrl(platform,handle)} target="_blank" rel="noopener noreferrer" onClick={onClick}
        className={`text-xs rounded-full px-3 py-1.5 font-medium inline-block ${isWhatsapp ? "bg-green-600 text-white":"border border-gray-300 text-gray-700"}`}>
            {PLATFORM_LABEL[platform] ?? platform}
        </a>
    );
    
}