"use client";
import {ReactNode, SyntheticEvent, useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import { Home ,ShoppingBag, Clipboard, Heart,Search, Bell, User, ChevronRight, MoreHorizontal,Package,MapPin,Star,Bookmark,Zap,Utensils,Sparkles,Shirt,Store,Menu,X,Briefcase,Laptop,Scissors, ClipboardList, SearchIcon, NotebookIcon, Notebook, UserCircle, ArrowRight, ScissorsIcon, BoxIcon, Layers3, Plug } from "lucide-react";


const CATEGORY_STYLE: Record<string,{bg:string, icon: ReactNode}> = {
    Fashion: {
        bg: "#FFE0D6",
        icon: <Shirt className="h-6 w-6"/>,
    },
    Electronics: {
        bg: "#DDF5EA",
        icon: <Plug className="h-6 w-6"/>,
    },
    Food: {
        bg: "#FFF0C7",
        icon : <Utensils className="h-6 w-6"/>,
    },
    Beauty: {
        bg : "#E7E5FF",
        icon : <Sparkles className="h-6 w-6"/>,
    },
    Textiles: {
        bg: "#F9DCE8",
        icon: <Layers3 className="h-6 w-6"/>,
    },
    Services: {
        bg: "#E4E9EF",
        icon: <Briefcase className="h-6 w-6"/>,
  
}
}
type Category={
    id:string,
    name:string
};

type Business = {
    id: string;
    name: string;

    location: {
        area?:string | null;
        address?: string | null;

    } | null;

    products: {
        id: string;
        name: string;
    }[];

    categories: {
        category: {
            id:string,
            name: string;
        };
    }[];
    socialLinks: {
        platform: string;
        url: string;
    }[];

}


const DEFAULT_CATEGORIES: Category[] = [
    {
        id: "fashion",
        name: "Fashion",
    },
    {
        id:"electronics",
        name: "Electronics",
    },
    {
        id: "food",
        name: "Food",
    },
    {
        id: "beauty",
        name: "Beauty",

    }, 
    {
        id: "textiles",
        name: "Textiles",
    },
    {
        id: "services",
        name:"Services"
    }
]
function getCategoryStyle(name:string) {
    return (CATEGORY_STYLE[name] ?? { bg: "#EEF1F4", icon: <MoreHorizontal className=" h-6 w-6"/>});

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
    const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
    const [loadingCategories,setLoadingCategories]=useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [businessLoading,setBusinessLoading] = useState(true);
    const [businesses,setBusinesses]=useState<Business[]>([]);
    const router = useRouter();

  useEffect(()=>{
    let cancelled=false;
    async function loadHomeData(){
        try{
            const [categoriesResponse,businessResponse]= await Promise.all([
                fetch("/api/categories",{cache:"no-store"}),
                fetch("/api/browse",{cache:"no-store"}),
            ]); 
             //Categories
          if(categoriesResponse.ok){
             const categoryData= await categoriesResponse.json();

             if(Array.isArray(categoryData.categories) && categoryData.categories.length>0 && !cancelled){
                setCategories(categoryData.categories.slice(0,6));
             }
        }   
        if (businessResponse.ok){
            const businessData = await businessResponse.json();

            if(!cancelled){
                setBusinesses(
                    Array.isArray(businessData.businesses) ? businessData.businesses.slice(0,4):[]
                );
            }
        }
        }
        catch (error){
            console.error("Failed to load homepage data", error);
        }
        finally{
            if(!cancelled){
                setBusinessLoading(false);
            }
        }
       
       
    }
    loadHomeData();

    return() => {
        cancelled = true
    }
  })

function handleSearch(event?: React.SyntheticEvent<HTMLFormElement>){
    event?.preventDefault();

    const query = q.trim();
    if(!query){
        router.push("/shop");
        return;
    }
    router.push(`/shop?q=${encodeURIComponent(query)}`);
}

function handleCategory(category: string){
    router.push(`/shop?category=${encodeURIComponent(category)}`);
}
function CategorySkeletons({sidebar = false}: {sidebar?: boolean}){
    if(sidebar){
        return(
            <div className="space-y-2">
                {Array.from({length: 6}).map((_,index) => (<div key={index} className="flex items-center gap-3 px-1 py-2"><div className="h-7 w-7 animate-pulse rounded-full bg-[#E9E6E0]"/><div className="h-3 w-20 animate-pulse rounded bg-[#E9E6E0]"/></div>))}
            </div>
        );
    }
    return (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {Array.from({length:6}).map((_,index)=> (<div key={index} className="h-[112px] animate-pulse rounded-xl border border-[#E9E%DE] bg-[#F0EDE7]"/>))}
        </div>
    );
}
    const submit= (event: SyntheticEvent) =>{
        event.preventDefault();
        const query=q.trim();
        if(!query) return;

        router.push(`/search?q=${encodeURIComponent(query)}`);
    };

    
    return(
        <main className="min-h screen bg-[#FFF7ED]">
            <div className="mx-auto min-h screen w-full max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
             <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[18px] border border-[#FF5A36]/100 bg-[#FFFDFC] shadow-sm sm:rounded-[22px] lg:min-h-[calc(100vh-40px)]">
              {/*Header */}
              <header className="flex h-[64px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:h-[66px] lg:px-6">
                <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm sm:h-10 sm:w-10">
                    <Store className="h-5 w-5"/>
                </div>
                <div>
                    <p className="text-sm font-bold tracking-tight text-base">
                        ReMarket
                    </p>
                    <p className="text-[10px] leading-none text-muted sm:text-[10px]"> Find it nearby</p>
                </div>
                </div>
               
                  
            

                   
                   {/*Desktop Navigation */}
                   <nav className="hidden items-center gap-1 md:flex">
                    {NAV_ITEMS.map((items) => {
                        const Icon = items.icon;
                        return (
                            <button 
                            key = {items.label}
                            type="button"
                            onClick={() => router.push(items.href)}
                            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${items.label === "Home" ? " text-gray-700 hover:bg-gray-50": "text-gray-700 hover:bg-gray-50"}`}>{items.label}</button>
                        );
                    })}
                   </nav>
                   {/*Right Action*/}
                   <div className="flex items-center gap-2 sm:gap-3">
                    <button 
                        type ="button"
                        onClick={() => {
                            const input = document.getElementById("homepage-search");
                            input?.focus();
                        }}
                        className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-gray sm:flex"
                        aria-label="Search">
                            <Search className="h-[19px] w-[19px] text-gray-700"/>
                        </button>
                        <button 
                        type="button"
                        className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-gray-50 sm:flex"
                        aria-label="Saved"
                        >
                            <Heart className="h-[19px] w-[19px] text-gray-700"/>
                        </button>
                        <button type="button"
                        className="hidden h-9 w-9 items-center justify-center rounded-full bg-gray-100 sm:flex"
                        aria-label="Profile">
                            <UserCircle className="h-6 w-6 text-gray-700"/>
                        </button>
                        <button type="button"
                        onClick={() => router.push("/request")}
                        className="rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-[11px] font-bold text-white shadow-sm transition hover:opacity-90 sm:px-4 sm:text-xs">
                            Request something
                        </button>
                   </div>
                    </header>

                    {/*Left SideBar*/}
                    <div className="flex">
                        <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
                        <nav className="space-y-1">
                            {NAV_ITEMS.map((item)=> {
                                const Icon = item.icon;
                                return (
                                    <button 
                                    key={item.label}
                                    type="button"
                                    onClick={() => router.push(item.href)}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transititon ${
                                        item.label === "Home" ? " font-medium text-gray-700 hover:bg-white": "font-medium text-gray-700 hover:bg-white"}`}
                                >
                                    <Icon className="h-[18px] w-[18px]"/>
                                    <span>{item.label}</span>
                                </button>)
                            })}
                        </nav>
                        <div className="my-5 h-px bg-[#E7E2DB]"/>
                        <div>
                            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                                Categories 
                            </p>
                            <div className="mt-3 space-y-1">
                                {categories.map((category)=>{
                                    const style = getCategoryStyle(category.name);
                                    return (
                                        <button key={category.id} type="button" onClick={() => handleCategory(category.name)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{backgroundColor:style.bg,}}>
                                                <span className="scale-[0.65]">{style.icon}
                                                </span>
                                            </span>
                                            <span className="truncate text-xs font-medium text-gray-700">{category.name}</span>
                                        </button>
                                    );
                                })}
                                <button type="button" onClick={()=>router.push("/shop")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100"><MoreHorizontal className="h-4 w-4 text-gray-500"/></span>
                                    <span className="text-xs font-medium text-gray-700">More</span>
                                </button>
                            </div>
                        </div>
                    </aside>
              
                   
               {/*Page Content */}
               <div className="min-w-0 flex-1">
                <div className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-6 lg:pb-8">
                    {/*Hero */}
                    <section className="relative min-h-[260px] overflow-hidden rounded-[18px] bg-[#FF5A36] px-6 py-7 text-white shadow-soft sm:min-h-[275px] sm:px-8 sm:py-9 lg:min-h-[275px] lg:px-8">
                        {/*Decorative Circle */}
                        <div className="absolute -right-16 -top-24 h-[260px] w-[260px] rounded-full bg-white/5">
                        {/*Decorative Shopping bag/location illustration */}
                        <div className="pointer-events-none absolute right-6 top-7 hidden opacity-90 md:block lg:right-12">
                            <div className="pointer-events-none absolute right-6 top-7 hidden opacity-90 md:block lg:right-12">
                                <div className="relative h-[190px] w-[220px]">
                                    <div className="absolute bottom-3 left-8 h-[110px] w-[105px] rotate-[-8deg] rounded-b-xl bg-white/70"/>
                                    <div className="absolute left-[55px] top-3 h-[80px] w-[65px] rounded-t-[40px] border-[10px] border-white/60 border-b-0"/>
                                    <div className="absolute bottom-0 right-3 flex h-[82px] w-[65px] rotate-[8deg] items-center justify-center rounded-[28px_28px_35px_35px] bg-white/40">
                                    <div className="h-10 w-10 rounded-full border-[8px] border-white/90"/>
                                    </div>
                                    <div className="absolute right-0 top-[95px] h-12 w-12 rotate-45 rounded-t-[28px] rounded-br-[28px] bg-white/70">
                                    <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF5A36]"/>
                                    </div>
                                    <div className="absolute right-[105px] top-0 h-4 w-1 rotate-[-35deg] bg-white/70"/>
                                    <div className="absolute right-[130px] top-5 h-3 w-1 rotate-[-50deg] bg-white/70"/>
                                </div>
                            </div>
                            </div>
                            </div>
                            <div className="relative z-10 max-w-[600px]">
                                <div className="mb-4 inline-flex items-center rounded-full bg-white px-4 py-2 text-[10px] font-medium text-[#9F2D18]">Your local marketplace</div>
                                <h1 className="max-w-[520px] text-[29px] font-bold leading-[1.1] tracking-tight sm:text-[34px] lg:text-[36px]">Find what you need,<br/>right around you</h1>
                            </div>
                            <p className="mt-3 max-w-[470px] text-xs leading-5 text-white/85 sm:text-sm">Search sellers,discover products and connect with people nearby without the hassle.</p>
                            <form onSubmit={submit} className="mt-5 flex h-[48px] w-full max-w-[455px] items-center rounded-full bg-white p-1.5 shadow-sm">
                                <Search className="ml-3 h-[18px] w-[18px] shrink-0 text-gray-500"/>
                                <input id="homepage-search" value={q} onChange={(event)=>setQ(event.target.value)} placeholder="What are you looking for?" className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-800 outline-none placeholder:text-gray-400"/>
                              <button type="submit" className="flex h-[38px] items-center rounded-full bg-[#FF5A36] px-5 text-xs font-bold text-white transition hover:opacity-90">Search</button>
                            </form>   
                    </section>
                     <section className="mt-5 sm:mt-6">
                     <div className="mb-3 flex items-end justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-[#17202A]">Explore categories</h2>
                          <p className="mt-0.5 text-xs text-muted">Start with something you need</p>  
                        </div>
                        <button type="button" onClick={()=>router.push("/shop")} className="flex items-center gap-1 text-xs font-medium text-[#9F2D18]">View all<ArrowRight className="h-3.5 w-3.5"/></button>
                        </div>   
                        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                        {categories.map((category)=>{
                            const style=getCategoryStyle(category.name);
                            
                            return(
                            <button key={category.id} type="button" onClick={()=> handleCategory(category.name)} className="group flex min-h-[112px] flex-col items-center justify-center rounded-xl border border-[#E8E4DE] bg-white px-2 py-2 transition hover:-translate-y-0.5 hover:shadow-md">
                                <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full transition group-hover:scale-105" style={{background:style.bg,}}>{style.icon}</span>
                                <span  className="mt-3 max-w-full truncate text-xs font-medium text-gray-800">{category.name}</span>
                            </button>
                            
                            );
                        })} 
                        {/*More */}
                        <button type="button" onClick={()=> router.push("/shop")} className="group flex min-h-[112px] flex-col items-center justify-center rounded-xl border border-[#E8E4DE] bg-white px-2 py-3 transition hover:-translate-y-0.5 hover:shadow-md">
                            <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#E9EDF0] transition group-hover:scale-105"><MoreHorizontal className="h-6 w-6 text-gray-600"/></span>
                            <span className="mt-3 text-xs font-medium text-gray-800">More</span>
                        </button>
                        </div> 
                    </section>   
                    {/*Request Banner */}
                    <section className="mt-5 flex flex-col gap-4 rounded-xl border border-[#F4DFC3] bg-[#FFF0D9] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                     <div className="flex items-center gap-3">
                     <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFE0AD]"><ClipboardList className="h-5 w-5 text-[#A76013]"/></div>    
                     <div>
                        <h2 className="text-sm font-bold text-gray-800">Can't find what you need?</h2>
                        <p className="mt-0.5 text-[11px] text-gray-600">Tell us what you are looking for and we will help find matching sellers.</p>
                    
                     </div>
                     </div> 
                     <button type="button" onClick={()=> router.push("/request")} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:opacity-90">Submit a request<ArrowRight className="h-3.5 w-3.5"/>
                     </button>   
                    </section>
                    <section className="mt-6">
                    <div className="mb-3 flex items-end justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-[#17202A]">Featured businesses</h2>
                            <p className="mt-0.5 text-xs text-muted">Discover businesses on ReMarket</p>
                        </div>
                        <button type="button" onClick={()=> router.push("/shop")} className="flex items-center gap-1 text-xs font-medium text-[#9F2D18]">View all<ArrowRight className="h-3.5 w-3.5"/></button>
                    </div>
                    {/*Loading */}
                    {businessLoading &&(
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {[1,2,3,4].map((item)=>(
                                <div key={item} className="h-[180px] animate-pulse rounded-xl border border-[#E8E4DE] bg-white"/>
                            ))}
                        </div>
                    )}
                    {/*Empty*/}
                    {!businessLoading && businesses.length === 0 && (
                        <div className="rounded-xl border border-[#E8E4DE] bg-white px-5 py-10 text-center">
                            <Store className="mx-auto h-8 w-8 text-gray-300"/>
                            <p className="mt-3 text-sm font-semibold text-gray-600">
                                No businesses available yet 
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                                Businesses will appear here when they are added to ReMarket.
                            </p>
                        </div>
                    )}
                    {/*Real backend businesses */}
                    {!businessLoading && businesses.length>0 && (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {businesses.map((business)=>{
                                const category=business.categories?.[0] ?.category?.name;
                                const style=getCategoryStyle( category??"Services");
                                const location=business.location?.area?? business.location?.address??"Local";
                                return(
                                    <article key={business.id} className="overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md">
                                        {/*Business Visual */}
                                     <div className="relative flex h-[92px] items-center justify-center" style={{backgroundColor:style.bg}}>
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/75 shadow-sm">
                                        <Store className="h-7 w-7 text-gray-700"/>
                                        </div>
                                        <span className="absolute right-3 top-3 rounded-full bg-[#DDF5EA] px-2.5 py-1 text-[9px] font-semibold text-[#137A59]">
                                            Active
                                        </span>
                                     </div>

                                     <div className="p-3.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <h3 className="truncate text-sm font-bold text-[#17202A]">
                                                    {business.name}
                                                </h3>
                                                <p className="mt-1 truncate text-[10px] text-muted">
                                                    {category ?? "Local business"} {""}.{location}
                                                </p>
                                            </div>
                                            <button type="button" aria-label={`Save ${business.name}`} className="shrink-0 text-gray-500 transition hover:text-[#9F2D18]"><Bookmark className="h-4 w-4"/></button>
                                        </div>
                                        <div className="mt-3 flext items-center justify-between">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[#F2B52B]"><Star className="h-6 w-6"/></span>
                                                <span className="text-[11px] font-semibold text-gray-700">Local</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                                <Package className="h-3 w-3"/>
                                                <span>{business.products?.length?? 0}{""}available</span>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() =>{
                                            if(category){
                                                handleCategory(category);
                                            }
                                            else{
                                                router.push("/shop");
                                            }
                                        }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFF1ED] py-2.5 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE6DF]">Browse <ArrowRight className="h-3.5 w-3.5"/></button>
                                     </div>
                                        
                                    </article>
                                );
                            })}
                        </div>
                    )}
                    </section>  
                    {/*Footer */}
                    <footer className="mt-7 flex items-center justify-center gap-3 text-[10px] text-gray-400">
                        <span className="h-px w-16 bg-gray-200"/>
                        <span>LocalMarket . Find it nearby</span>
                        <span className="h-px w-16 bg-gray-200"/>
                        </footer>       
                </div>
               </div>
              {/*Main Content */}
              {/*<div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-8">
                <section className="relative overflow-hidden rounded-[24px] bg-[#FF5A36] px-5 py-7 text-white shadow-soft sm:rounded-[28px] sm:px-8 sm:py-9 lg:px-10 lg:py-12">
                    <div className="relative z-10 max-w-3xl">
                        <span className="inline-flex rounded-full bg-[#FFFFFF] px-3 py-1.5 text-[10px] text-[#FF5A36] font-semibold backdrop-blur sm:text-[11px]">Your local marketplace</span>
                        <h1 className="mt-4 max-w-2xl text-[30px] font-bold leading-[1.08] racking-tight sm:text-4xl lg:text-5xl">Find what you need,<br className="hidden sm:block"/>right around you</h1>
                        <p className="mt-3 max-w-xl text-xs leading-5 text-white/85 sm:text-sm sm:leading">Search sellers, discover products and connect with people nearby without the hassle.</p>
                       {/*Search *
                       <div className="mt-6 flex w-full max-w-2xl items-center gap-1.5 rounded-full bg-[#FFFFFF] p-1.5 shadow-lg sm:mt-7">
                        <div className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF7ED] text-base sm:h-12 sm:w-12 sm:text-lg"><SearchIcon className="h-5 w-5"/></div>
                        <input value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>{if(e.key=="Enter"){ submit();}}} placeholder="What are you looking for ?" className="min-w-0 flex-1 bg-transparent px-1.5 text-xs text-[#17202A] outline-none placeholder:text-gray-400 sm:px-2 sm:text-xs"/>
                        <button type="button" onClick={submit} className="min-h-11 shrink-0 rounded-full bg-[#FF5A36] px-3.5 text-[11px] font-semibold text-[#FFFFFF] transition hover:bg-black sm:min-h-12 sm:px-5 sm:text-xs">Search</button>
                        
                       </div>
                    </div>
                    {/*Decorative Shapes *
                    <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#FFFFFF]/10 sm:h-72 sm:w-72"/>
                    <div className="pointer-events-none absolute -bottom-28 -right-10 h-64 w-64 rounded-full bg-black/5 sm:h-80 sm:w-80"/>
                    <div className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 text-[100px] opacity-20 lg:block"><ShoppingBag /></div>
                </section>
                {/*Categories *
                <section className="mt-8 sm:mt-10">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold tracking-tight text-[#17202A] sm:text-lg">Explore categories</h2>
                        <p className="mt-1 text-[11px] text-muted sm:text-xs">Start with something you need</p>
                    </div>
                    <button type="button" onClick={()=>//</div>router.push("/shop")} className="shrink-0 rounded-lg px-2 py-2 text-[11px] font-semibold text-[#9F2D18] transition hover:bg-white sm:text-xs">View all</button>
                  </div>
                  {/*Category Grid *
                  <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
                    {//loadingCategories ?(Array.from({//length:6}).map((_,index)=>(<div key={//index} className="h-[112px] animate-pulse rounded-2xl bg-white/70 sm-h-[130px]"/>))):categories.length>0 ? (categories.map((category)=> {
                        //</div>const style = CATEGORY_STYLE[category.name] ?? {//</div>bg:"#F0EcE6",icon:""};
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
                {/*Request CA 
                <section className="mt-7 rounded-2xl border border-orange-100 bg-[#FF5A36]/50 p-4 sm:mt-9 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-6">
                    <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm"><Notebook className="h-5 w-5"/></div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-[#17202A]">Can't find what you need?</p>
                        <p className="mt-1 max-w-xl text-[11px] leading-5 text-muted sm:text-xs">Tell us what you are looking for and we will help find matching sellers</p>
                    </div>
                    </div>
                    <button 
                    type="button"
                    onClick={() => router.push("/request")} className="mt-4 min-h-11 w-full rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] lg:mt-0 lg:w-auto lg:shrink-0">Submit a request</button>
                </section>
              </div> */}
              </div>
              {/*Mobile Button Navigation */}
              <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(6px,safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
              <div className="mx-auto grid max-w-md grid-cols-4">
                {NAV_ITEMS.map((item)=>{
                    const Icon=item.icon;
                    return(
                        <button key={item.label} type="button" onClick={() => router.push(item.href)} className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 ${item.label==="Home"? "text-[#9F2D18]":"text-[gray-500]"}`}>
                            <Icon className="h-[19px] w-[19px] "/>
                            <span className="text-[9px] font-medium">{item.label}</span>
                        </button>
                    );
                })}
              </div>
              </nav>
              </div>

            </div>
     </main>
    );
    
}
