type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant? : "primary" | "secondary" | "danger";};

export default function Button ({
    variant = "primary",
    className ="",
    children,
    ...props
}: ButtonProps){
    const styles = {
        primary: "bg-coral text-white shadow-sm hover:bg-[#f04d2c]",
        secondary: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
        danger: "bg-red-50 text-red-600 hover:bg-red-100",
    }
    return(
        <button
            {...props}
            className={[ "inline-flex items-center justify-center", "rounded-xl px-4 py-2.5","text-sm font-semibold","transition-all duration-150", "active:scale-[0.98]","disabled:cursor-not-allowed disabled:opacity-50",styles[variant],className].join("")}>
                {children}
            </button>
    )
}