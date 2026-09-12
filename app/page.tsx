"use client";
import {ReactNode, useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import { Home ,ShoppingBag, Clipboard, Heart,Search, Bell, User, ChevronRight, MoreHorizontal,Package,MapPin,Star,Bookmark,Zap,Utensils,Sparkles,Shirt,Store,Menu,X,Briefcase,Laptop,Scissors, ClipboardList } from "lucide-react";

const CATEGORY_STYLE: Record<string,CategoryStyle> = {
    fashion: {
        bg: "bg-[#FFF8F5]",
        iconBg: "bg-[#FFD9D1]",
        icon: <Shirt className="h-6 w-6 text-[#D94D3F]"/>,
    },
    electronics: {
        bg: "bg-[#F4FFFC]",
        iconBg: "bg-[#C8F1E5]",
        icon: <Zap className="h-6 w-6 text-[#087F69]"/>,
    },
    food: {
        bg: "bg-[#FFFBF1]",
        iconBg: "bg-[FFE3A6]",
        icon : <Utensils className="h-6 w-6 text-[#A66A00"/>,
    },
    beauty: {
        bg : "bg-[F8F4FF]",
        iconBg: "bg-[#DED2FF]",
        icon : <Sparkles className="h-6 w-6 text-[#6544C7]"/>,
    },
    textiles: {
        bg: "bg-[#FFF5FA]",
        iconBg: "bg-[#F5C5DE]",
        icon: <Scissors className="h-6 w-6 text-[#A62D6C]"/>,
    },
    services: {
        bg: "bg-[#F4F7F8]",
        iconBg: "bg-[#DDE5E8]",
        icon: <Briefcase className="h-6 w-6 text-[#475569]" />,
    },
    computers: {
        bg: "bg:[#F4F8FF]",
        iconBg: "bg-[#D5E3FF]",
        icon: <Laptop className="h-6 w-6 text-[#3565B8]"/>,
    },
    technology : {
        bg: "bg-[#F4F8FF]",
        iconBg: "bg-[D5E3FF]",
        icon: <Laptop className="h-6 w-6 text-[#3565B8]"/>,
    }
}
type Category={
    id:string,
    name:string
};

type CategoryStyle = {
    bg : string;
    iconBg: string;
    icon: ReactNode
}

const FALLBACK_CATEGORY_STYLE: CategoryStyle = {
    bg: "bg-[#F5F7F8]",
    iconBg: "bg-[E0E5E8]",
    icon: <Store className="h-6 w-6 text-[text-[#475569]"/>
};
function getCategoryStyle(name:string): CategoryStyle{
    const key = name.toLowerCase().trim();
    return CATEGORY_STYLE[key] ?? FALLBACK_CATEGORY_STYLE;
}

const NAV_ITEMS = [
    {
        label: "Home",
        href: "/",
        icon: Home,
    },
    {
        label: "Shop",
        href: "/shop",
        icon: ShoppingBag,
    },
    {
        label:"Requests",
        href: "/my-requests",
        icon: ClipboardList,
    },
    {
        label:"Saved",
        href: "/saved",
        icon: Heart,
    },
];
export default function HomePage(){
    const [q,setQ] = useState("");
    const [categories, setCategories] = useState<Category[]>([]);
    const [loadingCategories,setLoadingCategories]=useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const router = useRouter();

   useEffect(()=>{
    let cancelled = false;
    const loadCategories= async() =>{
        try{
            const res= await fetch("/api/categories",{ cache:"no-store"});
            if(!res.ok){
                throw new Error("Failed to fetch categories");
            }
            const data= await res.json();
            if(cancelled) return;

            if(Array.isArray(data.categories)){
                const backendCategories = data.categories.map((category:any) =>({
                    id: String(category.id),
                    name: String(category.name),
                })).filter((category:Category) => category.name.trim() !== "");
                setCategories(backendCategories);
            } else {
                 setCategories((data.categories??[]).slice(0,6));

            }
            
           


        }
        catch {
          setCategories([]);
        }
        finally{
            if(!cancelled){
                 setLoadingCategories(false);

            }
           
        }

    };
    loadCategories();
    return() => {
        cancelled = true;
    };
   }, []);

   
    const submit= () =>{
        const query=q.trim();
        if(!query) return;

        router.push(`/search?q=${encodeURIComponent(query)}`);
    };
    
    return(
        <main className="min-h screen overflow-x-hidden bg-[#FFF7ED] text-[#17202A]">
            <div className="mx-auto min-h-screen w-full max-w-[1440px]">
              {/*Header */}
              <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#FFF7ED]/95 backdrop-blur">
                <div className="mx-auto flex h-[68px] w-full items-center justify-between px-4 sm:px-6 lg:px-">
                   {/*Logo */}
                   <button type="button" onClick={()=> router.push("/")} className="flex min-h-11 items-center gap-2.5 rounded-xl">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-lg shadow-sm">""</div>
                    <div className="hidden min-[400px]:block text-left">
                        <p className="text-sm font-bold tracking-tight text-[#17202A]">Remarket</p>
                        <p className="text-[10px] text-muted">Find it nearby</p>
                    </div>
                   </button>
                   {/*Desktop Navigation */}
                   <nav className="hidden items-center gap-1 md:flex">
                    <button type="button" onClick={()=>router.push("/")} className="rounded-xl bg-coral/10 px-4 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FF5A36]/5">Home</button>
                    <button type="button" onClick={()=> router.push("/shop")} className="rounded-xl px-4 py-2.5 text-xs font-medium text-gray-600 transition hover:bg-[#FF5A36]/5">Shop</button>
                    <button type="button" onClick={()=> router.push("/my-requests")} className="rounded-xl px-4 py-2.5 text-xs font-medium text-gray-600 transition hover:bg-[#FF5A36]/5">Requests</button>
                    <button type="button" onClick={()=> router.push("/saved")} className="rounded-xl px-4 py-2.5 text-xs font-medium text-gray-600 transition hover:bg-[#FF5A36]/5">Saved</button>
                   </nav>
                   {/*Desktop Actions*/}
                   <div className="hidden items-center gap-2 md-flex">
                    <button type="button" onClick={()=> router.push("/saved")} aria-label="Saved businesses" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF] text-base shadow-sm transition hover:shadow-card"></button>
                    <button type="button" onClick={()=> router.push("/request")} className="min-h-10 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-[#FFFFFF] shadow-sm transition hover:opacity-90">Request something</button>
                    </div>
                    {/*Mobile action */}
                    <button type="button" onClick={()=> router.push("/request")} className="min-h-10 rounded-full bg:[#FFFFFF] px-3.5 py:2 text-[11px] font-semibold text-gray-700 shadow-sm md:hidden">Request</button>
                    
                </div>
              </header>
              {/*Main Content */}
              <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-8">
                <section className="relative overflow-hidden rounded-[24px] bg-[#FF5A36] px-5 py-7 text-white shadow-soft sm:rounded-[28px] sm:px-8 sm:py-9 lg:px-10 lg:py-12">
                    <div className="relative z-10 max-w-3xl">
                        <span className="inline-flex rounded-full bg-[#FFFFFF] px-3 py-1.5 text-[10px] text-[#FF5A36] font-semibold backdrop-blur sm:text-[11px]">Your local marketplace</span>
                        <h1 className="mt-4 max-w-2xl text-[30px] font-bold leading-[1.08] racking-tight sm:text-4xl lg:text-5xl">Find what you need,<br className="hidden sm:block"/>right around you</h1>
                        <p className="mt-3 max-w-xl text-xs leading-5 text-white/85 sm:text-sm sm:leading">Search sellers, discover products and connect with people nearby without the hassle.</p>
                       {/*Search */}
                       <div className="mt-6 flex w-full max-w-2xl items-center gap-1.5 rounded-full bg-[#FFFFFF] p-1.5 shadow-lg sm:mt-7">
                        <div className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF7ED] text-base sm:h-12 sm:w-12 sm:text-lg"></div>
                        <input value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>{if(e.key=="Enter"){ submit();}}} placeholder="What are you looking for ?" className="min-w-0 flex-1 bg-transparent px-1.5 text-xs text-[#17202A] outline-none placeholder:text-gray-400 sm:px-2 sm:text-xs"/>
                        <button type="button" onClick={submit} className="min-h-11 shrink-0 rounded-full bg-[#FF5A36] px-3.5 text-[11px] font-semibold text-[#FFFFFF] transition hover:bg-black sm:min-h-12 sm:px-5 sm:text-xs">Search</button>
                        
                       </div>
                    </div>
                    {/*Decorative Shapes */}
                    <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#FFFFFF]/10 sm:h-72 sm:w-72"/>
                    <div className="pointer-events-none absolute -bottom-28 -right-10 h-64 w-64 rounded-full bg-black/5 sm:h-80 sm:w-80"/>
                    <div className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 text-[100px] opacity-20 lg:block">O</div>
                </section>
                {/*Categories */}
                <section className="mt-8 sm:mt-10">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold tracking-tight text-[#17202A] sm:text-lg">Explore categories</h2>
                        <p className="mt-1 text-[11px] text-muted sm:text-xs">Start with something you need</p>
                    </div>
                    <button type="button" onClick={()=>router.push("/shop")} className="shrink-0 rounded-lg px-2 py-2 text-[11px] font-semibold text-[#9F2D18] transition hover:bg-white sm:text-xs">View all</button>
                  </div>
                  {/*Category Grid */}
                  <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
                    {loadingCategories ?(Array.from({length:6}).map((_,index)=>(<div key={index} className="h-[112px] animate-pulse rounded-2xl bg-white/70 sm-h-[130px]"/>))):categories.length>0 ? (categories.map((category)=> {
                        const style = CATEGORY_STYLE[category.name] ?? {bg:"#F0EcE6",icon:""};
                        return (<button key={category.id} type="button" onClick={()=> router.push(`/shop? category=${encodeURIComponent(category.name)}`)} className="group flex min-h-[108px] flex-col items-center justify-center gap-2 rounded-2xl border-black/[0.03] bg-white p-3 shadow-card transition hover:translate-y-0.5 hover:shadow-soft active:scale-[0.98] sm:min-h-[125px]">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full text-lg sm:h-12 sm:w-12 sm:text-xl" style={{backgroundColor:style.bg}}>
                                {style.icon}
                            </div>
                            <span className="line-clamp-1 text-center text-[10px] font-semibold text-gray-700 sm:text-[11px]">
                                {category.name}</span> 
                        </button>);
                    })): (<div className="col-span-full rounded-2xl bg-white p-5 text-center shadow-[0_4px_20px_rgba(23,32,42,0.05)]"><p className="text-xs text-muted">Categories will appear here</p></div>)}
                  </div>
                </section>
                {/*Request CA */}
                <section className="mt-7 rounded-2xl border border-orange-100 bg-[#FF5A36]/50 p-4 sm:mt-9 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-6">
                    <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm"></div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-[#17202A]">Can't find what you need?</p>
                        <p className="mt-1 max-w-xl text-[11px] leading-5 text-muted sm:text-xs">Tell us what you are looking for and we will help find matching sellers</p>
                    </div>
                    </div>
                    <button 
                    type="button"
                    onClick={() => router.push("/request")} className="mt-4 min-h-11 w-full rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] lg:mt-0 lg:w-auto lg:shrink-0">Submit a request</button>
                </section>
              </div>

            </div>
     </main>
    );
    
}
