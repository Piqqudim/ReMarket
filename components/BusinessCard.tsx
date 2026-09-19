"use client";

import Link from "next/link";
import { Heart, MapPin, Store } from "lucide-react";
import {useEffect, useState} from "react";
import { isBusinessSaved,saveBusiness,removeSavedBusiness } from "@/lib/saved";

type BusinessCardProps = {
    business: {
        id: string;
        name: string;
        area: string;
        category: string;
        verified? : boolean;
        availability? : string;
    };
};

export default function  BusinessCard({
    business,
} : BusinessCardProps){
    const[saved,setSaved] = useState(false);

    useEffect(()=> {
        setSaved(isBusinessSaved(business.id));
    }, [business.id]);

    function toggleSaved(){
        if(saved){
            removeSavedBusiness(business.id);
            setSaved(false);
            return;
        }
    }
    saveBusiness({
        id: business.id,
        name: business.name,
        area: business.area,
        category: business.category,
        verified: business.verified,
        availability: business.availability,
    });
    setSaved(true);
}
return(
    <article className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div 
    </article>
)