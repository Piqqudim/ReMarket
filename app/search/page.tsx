"use client";
import { SyntheticEvent, useEffect,useState,type ReactNode } from "react";
import { useSearchParams,useRouter } from "next/navigation";
import Link from "next/link";
import{Search,Heart, Bell,UserCircle,Store,Home as HomeIcon,ShoppingBag,ClipboardList,Bookmark,ArrowLeft,ArrowRight,CheckCircle2,MapPin,Package,Shirt,Plug,Utensils,Scissors,Layers3,Wrench,MoreHorizontal, DotIcon, HeartOff, SlidersHorizontal, Loader2, ChevronRight,} from "lucide-react";
import AvailabilityDot from "@/components/AvailabilityDot";
import VerificationMark  from "@/components/VerificationMark";
import ContactButton from "@/components/ContactButton";

/*Types */
//business
type SocialLink = {
    platform: string;
    handle: string;
}
type Category = {
    id: string ;
    name: string;
}
type SearchResult={
    id:string;
    name:string;
    priceMin?:number;
    priceMax?:number;
    availability:string;
    verification:string,
    location?:{
        area:string;
    };
    categories:{
        category:{
            name:string;
        }
    }[];
    socialLinks?:SocialLink[];
}


//Categories
const CATEGORY_STYLE:Record<string,{bg:string,icon:ReactNode}>={
    fashion:{
        bg:"#FFE0D6",
        icon:(<Shirt className="h-5 w-5 text-[#D94835]"/>),
    },
    electronics:{
        bg:"#DDF5EA",
        icon:(<Plug className="h-5 w-5 text-[#15946B]"/>),
    },
    food:{
        bg:"#FFF0C7",
        icon:(<Utensils className="h-5 w-5 text-[#B97900]"/>),
    },
    beauty:{
        bg:"#E7E5FF",
        icon:(<Scissors className="h-5 w-5 text-[#6551C7]"/>),
    },
    textiles:{
        bg:"#F9DCE8",
        icon:(<Layers3 className="h-5 w-5 text-[#B64C7A]"/>),
    },
    services:{
       bg:"#E4E9EF",
       icon:(<Wrench className="h-5 w-5 text-[#53616F]"/>),
    },


    
};

const DEFAULT_CATEGORIES: Category[] = [
    {
        id: "fashion", name:"Fashion"
    },
    {
        id: "electronics",
        name: "Electronics",
    },
    {
        id: "food",
        name:"Food"
    },
    {
        id: "beauty",
        name:"Beauty"
    },
    {
        id: "textiles",
        name:"Textiles",
    }

]


function getCategoryStyle(name:string){
    return(
        CATEGORY_STYLE[name.toLowerCase()]?? {
            bg:"#EEF1F4",
            icon:(<MoreHorizontal className="h-5 w-5 text-gray-500"/>),
        }
    );
}
const NAV_ITEMS= [
    {
        label:"Home",
        href:"/",
        icon:HomeIcon,
    },
    {
        label:"Shop",
        href:"/shop",
        icon:ShoppingBag,
    },
    {
        label:"Requests",
        href:"/request",
        icon:ClipboardList,
    },
    {
        label:"Saved",
        href:"/saved",
        icon:Bookmark
    },
];
//Search Results
export default function SearchResults() {
    const params=useSearchParams();
    const router = useRouter();

    const q = params.get("q") ?? "";

    const[searchInput, setSearchInput] = useState(q);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(true);

    const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);

    useEffect(() => {
        fetch("api/categories").then((res) => res.json()).then((data) => {
            const backendCategories = data.categories ?? [] ;

            if(backendCategories.length > 0){
                setCategories(backendCategories.slice(0,6));
            }
        }) .catch(()=>{

        });
    }, []);

    useEffect(()=> {
        setSearchInput(q);
        setLoading(true);

        fetch(`/api/search?q=${encodeURIComponent(q)}`).then((res)=> res.json()).then((data)=> {
            setResults(data.results ?? []);
        }).catch(() => {
            setResults([]);
        }).finally(()=> {
            setLoading(false);
        });
    }, [q]);


    const submitSearch = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();

        const query = searchInput.trim();

        if(!query) return;

        router.push(`/search?q=${encodeURIComponent(query)}`);
    };
    const contact = (
        businessId: string,
        platform: string
    ) => {
        fetch("api/events", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                
            },
            body: JSON.stringify({
                businessId,
                platform,
            }),
        }).catch(() => {});
    };
    return (
        <main className="min-h screen w-full bg-[#FFF7ED] text-[#17202A]">
            <div className="mx-auto flex min-h-screen w-full max-w-[1500px] px-3 py-4 sm:px-5 sm:py-5">
                

                
                <aside className="hidden w-[225px] shrink-0 border-r border-[#FF5A36]/50 bg-white/50 px-4 py-6 lg:flex lg:flex-col">
                <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                    <Store size={21}/>
                </div>
                <div>
                    <p className="text-base font-bold tracking-tight">
                        ReMarket
                    </p>
                    <p className="text-[10px] text-muted">
                        Find it Nearby
                    </p>
                </div>
                </Link>
                <nav className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link 
                            key= {item.label}
                            href={item.href}
                            className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-gray-700 transition hover:bg-[#FFFFFF]-50 hover:text-[#FF5A36]">
                                <Icon size={19}/>
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
                <div className="my-5 border-t border-gray-200"/>

                <div>
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                        Categories
                    </p>
                    <div className="mt-3 flex flex-col gap-1">
                        {categories.map((category) => {
                            const style = CATEGORY_STYLE[category.name];
                            return(
                                <Link
                                 key={category.id}
                                 href={`/shop?category=${encodeURIComponent(category.name)}`}
                                 className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-gray-700 transition hover:bg-white">
                                    <span 
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style = {{backgroundColor: style?.bg ?? "#F3F4F6",}}>
                                        {style?.icon ?? ""}
                                    </span>
                                    {category.name}
                                 </Link>

                            )
                        })}
                        <Link 
                            href="/shop"
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-gray-600 transition hover:bg-white">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                                    <DotIcon/>
                                </span>
                                More
                            </Link>
                    </div>
                </div>
                <div className="mt-auto rounded-2xl bg-[#FF5A36]/10 p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36]/20 text-[#9F2D18]">
                        <ClipboardList size={18} />
                    </div>
                    <p className="mt-3 text-sm font-bold">
                        Can't Find what you need
                    </p>
                    <p className="mt-1 text-[-11px] leading-5 text-muted">
                        Tell us what you are looking for and we will help find matching local sellers
                    </p>
                </div>
                </aside>

                <div className="min-w-0 flex-1">
                    <header className="hidden h-[72px] items-center justify-between border-b border-[#FF5A36] bg-white/40 px-7 lg:flex">
                    <div className="flex items-center gap-7">
                        <span className="text-sm font-semibold text-[#9F2D18]">
                            Search 
                        </span>
                        <Link 
                            href="/shop"
                            className="text-sm text-gray-600 hover:text-[#17202A]">
                                Shop
                        </Link>

                        <Link
                            href="/request"
                            className="text-sm text-gray-600 hover:text-[#17202A]">
                                Requests
                        </Link>
                        <Link 
                            href="/saved"
                            className="text-sm text-gray-600 hover:text-[#17202A]">
                                Saved
                        </Link>
                    </div>
                    
                    </header>

                    <header className="flex items-center justify-between px-4 pt-5 lg:hidden">
                        <Link 
                         href="/"
                         className="flex items-center gap-2.5"
                         >
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                                <Store size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold">
                                    ReMarket
                                </p>
                            <p className="text-[10px] text-muted">
                                Find it nearby
                            </p>
                            </div>
                         </Link>
                         <Link 
                            href = "/request"
                            className="rounded-full border border-[#FF5A36]/50 bg-white px-3.5 py-2 text-xs font-semibold shadow-sm">
                                Request 
                            </Link>
                    </header>

                    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
                        <Link 
                        href = "/"
                        className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-[#17202A]">
                            <ArrowLeft size={14} />
                            Back home
                        </Link>

                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Find what you need
                        </h1>
                        <p className="mt-1.5 text-sm text-muted">
                            Search local sellers, products and services
                        </p>
                        <form onSubmit={submitSearch} className="mt-6 flex w-full items-center gap-2 rounded-full border border-orange-100 bg-white p-1.5 shadow-card">
                            <Search size={19} className="ml-3 shrink-0 text-gray-400"/>
                            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="what are you looking for" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm outline-none placeholder:text-gray-500"/>
                            <button type="submit"
                            disabled={!searchInput.trim()}
                            className="rounded-full bg-[#FF5A36] px-5 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                                Search
                            </button>
                        </form>
                        <div className="mt-8 flex items-end justify-between">
                            <div>
                                <h2 className="text-base font-bold sm:text-lg">
                                    {
                                        q? `Results for "${q}"`
                                        : "Search results"
                                    }
                                </h2>
                                {
                                    !loading && (
                                        <p className="mt-0.5 text-xs text-muted">
                                            {results.length} {""} {results.length === 1 ? "seller" : "sellers"} {""}
                                        </p>
                                    )
                                }
                            </div>
                            <button 
                                type="button"
                                className="flex items-center gap-1.5 rounded-full border border-orange-100 bg-white px-3.5 py-2 text-xs font-medium text-gray-600 shadow-sm">
                                    <SlidersHorizontal size={14} />
                                    Filter
                                </button>
                            {
                                loading && (
                                    <div className="mt-5 flex items-center justify-center rounded-2xl border border-orange-100 bg-white py-14 shadow-card">
                                        <div className="flex items-center gap-2 text-sm text-muted">
                                            <Loader2 size={17} className="animate-spin text-coral"/>
                                            Searching local sellers
                                        </div>
                                    </div>

                                )
                            }

                            {
                                !loading && results.length === 0 && (<div className="mt-5 rounded-2xl border border-orange-100 bg-white px-6 py-12 text-center shadow-card">
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#FF5A36]">
                                        <Search size={24} />
                                    </div>
                                    <h3 className="mt-5 text-base font-bold">
                                        No sellers found yet
                                    </h3>
                                    <p className="mx-auto mt-2 mex-w-sm text-sm leading-6 text-muted">
                                        We could not find a seller matching your search
                                    </p>
                                    <Link 
                                    href = {`/request ${q ? '?q=${encodingURIComponent(q)}': ""}`}
                                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-semi-bold text-white">
                                        Submit a request
                                        <ChevronRight size={15} />
                                    </Link>
                                </div>)}
                            
                        </div>
                    </div>
                </div>
            </div>
            
        </main>
    )
}
