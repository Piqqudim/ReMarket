"use client";

import { Heart, Home, MapPin, ShoppingBag } from "lucide-react";
import Link from "next/link";

const NAV_ITEMS = [
    {
        label: "Home",
        href : "/",
        icon: Home
    },
    {
        label: "Shop",
        href: "/shop",
        icon: ShoppingBag
    },
    {
        label: "Near me",
        href: "/near-me",
        icon: MapPin,
    }, 
    {
        label: "Saved",
        href : "/saved",
        icon: Heart,
    },

];

export default function BuyerNav(){
    return (
        <>
        {/**DESKTOP  SIDEBAR*/}
        <aside className="hidden w-[225px] shrink-0 border-r border-[#FF5A36]/100 bg-white/50 px-4 py-6 lg:flex lg:flex-col">
        <Link
        href="/"
        className="mb-8 flex items-center gap-2.5 px-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <ShoppingBag size={21} />
            </div>
            <div>
                <p className="text-base font-bold tracking-tight">
                    ReMarket
                </p>
                <p className="text-[10px] text-muted">
                    Find it nearby
                </p>
            </div>
        </Link>
        <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item)=> {
                const Icon = item.icon;
                return (
                    <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-gray-700 transition hover:bg-[#FF5A36] hover: text-[#9F2D18]">
                        <Icon size={19} />
                        {item.label}
                    </Link>
                );
            })}
        </nav>

        <div className="mt-auto rounded-2xl bg-[#FFA500]/50 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFA500]/100 text-[#9F2D18]">
            <MapPin size={18} />
        </div>
        <p className="mt-3 text-sm font-bold">
            Find sellers near you
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted">
            See local businesses closest to your current location
        </p>
        <Link 
            href="/near-me"
            className="mt-3 flex items-center justify-center rounded-xl bg-[#FF5A36] px-3 py-2.5 text-xs font-semibold text-white transition hover:opacity-90">
                Explore nearby
            </Link>
        </div>
        </aside>
        {/**MOBILE BOTTOM NAV */}
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-orange-100 bg-white/95 px-3 pb-[max(10px, safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around">
            {
                NAV_ITEMS.map((item)=>{
                    const Icon = item.icon;
                    return (
                        <Link 
                            key={item.href}
                            href={item.href}
                            className="flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-medium text-gray-400 transition hover: text-[#9F2D18]">
                                <Icon size={21} />
                                <span>{item.label}</span>
                            </Link>
                    );
                })
            }
        </div>
        </nav>
        </>
    );
}