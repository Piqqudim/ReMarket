export type ContactPlatform = 
|"WHATSAPP"
|"INSTAGRAM"
|"TIKTOK"
|"FACEBOOK"
|"PHONE"
|"DIRECTIONS"


export function buildContactUrl(platform: ContactPlatform|string, handle: string): string {
    const clean = handle.trim().replace(/^@/,"");
    if(!clean) return "#";

    switch(platform){
        case "WHATSAPP": {
            if (clean.startsWith("http")){
                return clean;
            }
            const phone = clean.replace(/\D/g,"");
            return phone? `https://wa.me/${phone}`: "#";
        }
        case "INSTAGRAM": return clean.startsWith("http") ? clean : `https://instagram.com/${clean}`;
        case "TIKTOK" : return clean.startsWith("http") ? clean: `https://tiktok.com/@${clean}`;
        case "FACEBOOK" : return clean.startsWith("http") ? clean : `https://facebook.com/${clean}`;
        case "PHONE": return `tel${clean.replace(/[^\d+]/g, "")}`;
        case "DIRECTIONS": return clean.startsWith("http") ? clean: "#";
        default: return "#";
    }
}