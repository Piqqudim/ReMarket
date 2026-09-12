
export default function VerificationMark({
    verification,
    variant = "pill",
}: {verification: string, variant?:"inline" | "pill"}){
    const verified = verification === "VERIFIED";

    if(!verified){
        if(variant === "inline") return null;

        return (
            <span className="inline-flex items-center rounded-full bg-gray-100px px-2 py-0.5 text-[10px] font-medium text-gray-500">
                Unverified
            </span>
        );
    }
    if(variant === "inline"){
        return (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700" title="Verified business" aria-label="Verified business"> tickicon</span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] text-white">
                tickLogo
            </span>
            Verified
        </span>
    )
}