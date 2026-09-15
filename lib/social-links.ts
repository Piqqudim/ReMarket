export function buildContactUrl(platform: string, handle: string): string {
    const clean = handle.replace(/^@/,"").trim();
    switch(platform){
        case "WHATSAPP": return 'https://wa.me/${clean.replace(/\D/g,"")}';
        case "INSTAGRAM": return 'https://instagram.com/${clean}';
        case "TIKTOK" : return 'https://tiktok.com/@${clean}';
        case "FACEBOOK" : return clean.startsWith("http") ? clean : `https://facebook.com/${clean}`;
        case "PHONE": return 'tel:${clean}';
        default: return "#";
    }
}