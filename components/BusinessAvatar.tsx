const AVATAR_COLORS = [
    "FFE0D6",
    "DDF5EA",
    "FFF0C7",
    "E7E5FF",
    "F9DCE8",
    "DCEEFF",
];

function initials(name: string){
    return name.trim().split(/\s+/).map((word)=> word[0]).slice(0,2).join("").toUpperCase();
}

function colorFor(name: string){
    if(!name) return AVATAR_COLORS[0];

    let hash =0
    for(let i = 0; i< name.length; i++){
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function BusinessAvatar({
    name,
    size = 40,
}: {
    name: string;
    size?: number;
}){
    return (
        <div 
            className="flex flex-shrink-0 items-center justify-center rounded-full font-bold text-ink"
            style= {{
                width: size,
                height: size,
                backgroundColor: colorFor(name),
                fontSize: Math.max(11,size * 0.32)
            }}
            aria-label={name}
            >
                {initials(name)}
        </div>
    );
}