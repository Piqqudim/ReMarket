"use client";
const CONFIG: Record<string,{
    dot: string,
    bg: string,
    text: string,
    label: string;
}
>= {
    AVAILABLE : {
        dot: "bg-green-500",
        bg: "bg-green-50",
        text: "text-green-700",
        label: "Available",
    },
    ASK_SELLER: {
        dot: "bg-amber-500",
        bg: "bg-red-50",
        text:"text-amber-700",
        label: "Ask seller",
    },
    UNAVAILABLE: {
        dot: "bg-red-500",
        bg: "bg-red-50",
        text: "text-red-700",
        label: "unavailable",
    },
};

export default function AvailabilityDot({
    status, showLabel =false,
}:{ status: string; showLabel?:boolean;}){
    const config = CONFIG[status] ?? CONFIG.ASK_SELLER;
    if (!showLabel){
        return(
            <span className="inline-flex items-center gap-1.5" title={config.label} aria-label={config.label}>
                <span className={'h-2 w-2 rounded-full ${config.dot}'} />
            </span>
        );
    }
    return(
        <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${config.bg} ${config.text}'}>
            <span className={'h-1.5 w-1.5 rounded-full ${config.dot}'}/>
        </span>
    );
}