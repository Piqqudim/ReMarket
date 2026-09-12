const STATUS_CONFIG: Record<
string,{
    bg: string;
    text: string;

}> = {
    ACTIVE: {
        bg: "bg-green-50",
        text: "text-green-700"
    },
    INACTIVE: {
        bg: "bg-gray-100",
        text: "text-gray-500",
    },
    PENDING: {
        bg: "bg-amber-50",
        text: "text-amber-700",
    },
};

export function StatusBadge({status}: {status: string}){
    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.INACTIVE;
    return (
        <span className={'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${config.bg} ${config.text}'}>
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}