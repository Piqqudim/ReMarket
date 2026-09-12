const PLATFORM_LABEL: Record<string,string> ={
    WHATSAPP: "Whatsapp",
    INSTAGRAM: "Instagram",
    TIKTOK: "Tiktok",
    FACEBOOK: "Facebook",
    PHONE: "Call",

};

export default function ContactButton({platform, onClick}: {platform: string, onClick: ()=> void;}){
    const isWhatsapp = platform == "WHATSAPP";
    return(
        <button 
         type="button"
         onClick={onClick}
         className={["inline-flex items-center justify-center","rounded-full px-4 py-2", "text-xs font-semibold","transition-all duration-150","active:scale-[0.98]",isWhatsapp ? "bg-green-600 text-white hover:bg-green-700": "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",].join("")}>
            {PLATFORM_LABEL[platform] ?? platform}
         </button>

    );
}