export default function PageHeader({
    title,
    description,
    action,
}: {
    title: string,
    description: string,
    action?: React.ReactNode;
}){
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">
                    {title}
                </h1>
                {description && (<p className="mt-1 text-sm leading-6 text-muted">
                    {description}
                </p>)}
            </div>
            {action}
        </div>
    );
}