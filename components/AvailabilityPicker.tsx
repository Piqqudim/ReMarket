"use client";

const OPTIONs = [
    {value: "AVAILABLE", label: "available", dot: "bg-green-500"},
    {value: "ASK_SELLER", label: "ask seller", dot: "bg-yellow-500"},
    {value: "UNAVAILABLE", label:"unavailable", dot:"bg-red-500"},
];

export default function AvailabilityPicker({
    value,
    onChange,
}: {
    value: string,
    onChange: (v:string) => void;
}) {
    return (
        <div className="flex gap-1.5 flex-wrap">
            {OPTIONs.map((opt)=> {
                const active = value === opt.value;
                return (
                    <button 
                    key= {opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={'text-xs rounded-full px-3 py-1 flex items-center gap-1.5 border ${ active ? "bg-green-50 border-green-300 text-green-800": "border-gray-300 text-gray-500"}'}>
                        <span className={' w-1.5 h-1.5 rounded-full ${opt.dot}'} />
                    </button>
                );
            })}
        </div>
    );
}