"use client"
import { useState } from "react";

export default function ImageUpload({
    value,
    onChange,
}:{value?: string; onChange:(url: string) => void;}) {
    const [uploading,setUploading] = useState(false);
    const [error, setError] = useState("");
    const handleFile = async (file: File) => {
        setError("");
        if(!file.type.startsWith("/image")){
            setError("Please choose an image. ");
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/upload",{
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if(!res.ok){
                setError(data.error ?? "upload failed .");
                return;
            }
            onChange(data.url);
        } catch {
            setError("Unable to upload image. ");
        }
        finally {
            setUploading(false);
        }
    };

    return(
        <div className="flex flex-col gap-3">
            {value ? (
                <div className="relative w-fit">
                    <img 
                        src= {value}
                        alt = "Uploaded preview"
                        className="h-24 w-24 rounded-xl object-cover"
                    />
                    <button 
                    type="button"
                    onClick={() => onChange("")}
                    className="absolute-right-2-top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-white shadow" aria-label="Remove-image">
                        x
                    </button>
                </div>
            ): (<label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-7 text-center transition hover:bg-gray-100">
                <span className="text-2xl">IconCamera</span>
                <span className="mt-2 text-xs font-semibold text-gray-700">Add a photo</span>
                <span className="mt-1 text-[11px] text-gray-400">JPG, PNG, or WebP</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file){
                        void handleFile(file);
                    }
                }}/>
            </label>)}
            {uploading && (<p className="text-xs text-muted">
                Uploading image...
            </p>)}
            {error && (<p className="text-xs font-medium text-red-600">{error}</p>)}
        </div>
    );
}