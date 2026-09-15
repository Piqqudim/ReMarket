"use client";
import { SyntheticEvent, useEffect,useState,type ReactNode } from "react";
import { useSearchParams,useRouter } from "next/navigation";
import Link from "next/link";
import{Search,Heart,Sparkles, Bell,UserCircle,Store,Home as HomeIcon,ShoppingBag,ClipboardList,Bookmark,ArrowLeft,ArrowRight,CheckCircle2,MapPin,Package,Shirt,Plug,Utensils,Scissors,Layers3,Wrench,MoreHorizontal, DotIcon, HeartOff, SlidersHorizontal, Loader2, ChevronRight, Briefcase,} from "lucide-react";
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
    Fashion:{
        bg:"#FFE0D6",
        icon:(<Shirt className="h-5 w-5 text-[#D94835]"/>),
    },
    Electronics:{
        bg:"#DDF5EA",
        icon:(<Plug className="h-5 w-5 text-[#15946B]"/>),
    },
    Food:{
        bg:"#FFF0C7",
        icon:(<Utensils className="h-5 w-5 text-[#B97900]"/>),
    },
    Beauty:{
        bg:"#E7E5FF",
        icon:(<Sparkles className="h-5 w-5 text-[#6551C7]"/>),
    },
    Textiles:{
        bg:"#F9DCE8",
        icon:(<Layers3 className="h-5 w-5 text-[#B64C7A]"/>),
    },
    Services:{
       bg:"#E4E9EF",
       icon:(<Briefcase className="h-5 w-5 text-[#53616F]"/>),
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
const AVAILABILITY_OPTIONS=[
 {
    value:"AVAILABLE",
    label:"Available",
 },
 {
    value:"ASK_SELLER",
    label:"Ask seller",
 },
 {
    value:"UNAVAILABLE",
    label:"Unavailable",
 },
];

//Search Results
export default function SearchResults() {
    const params=useSearchParams();
    const router = useRouter();

    const q = params.get("q") ?? "";
//Search
    const[searchInput, setSearchInput] = useState(q);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(true);
//Categories
    const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
    
//Filter Ui
const [filterOpen,setFilterOpen]=useState(false);
const [selectedCategory,setSelectedCategory] =useState("All");
const [selectedAvailability,setSelectedAvailability]=useState("All");
const [locationFilter, setLocationFilter] = useState("");
const [minPrice,setMinPrice] = useState("");
const [maxPrice,setMaxPrice] =useState("");
const [verifiedOnly, setVerifiedOnly] =useState(false); 


  //Load Categories
    useEffect(() => {
        fetch("api/categories").then((res) => res.json()).then((data) => {
            const backendCategories = data.categories ?? [] ;

            if(backendCategories.length > 0){
                setCategories(backendCategories.slice(0,6));
            }
        }) .catch(()=>{
           //Keep Categories default
        });
    }, []);

    //Search
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
    //Contact Event
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
    const clearFilters=() =>{
        setSelectedCategory("All");
        setSelectedAvailability("All");
        setLocationFilter("");
        setMinPrice("");
        setMaxPrice("");
        setVerifiedOnly(false);
    };

    const filteredResults=results.filter((business)=>{
        //Category
        if(selectedCategory!=="All"){
            const matchesCategory=business.categories?.some((item)=>{
                item.category.name.toLowerCase()===selectedCategory.toLowerCase();
            });

            if(!matchesCategory){
                return false;
            }
        }
        //Availability
        if(selectedAvailability!=="All" && business.availability!== selectedAvailability){
            return false;
        }
        //Location
        if(locationFilter.trim()){
            const area=business.location?.area?.toLowerCase()??"";
            if(area.includes(locationFilter.trim().toLowerCase())){
                return false;
            }
        }
        //Verification
        if(verifiedOnly){
            if(business.verification!=="VERIFIED"){
                return false;
            }
        }
        //Min Price
        if(minPrice){
            const minimum=Number(minPrice);
            if(business.priceMax!==undefined && business.priceMax< minimum){
                return false;
            }
        }
        //Max Price
        if(maxPrice){
            const maximum=Number(maxPrice);
            if(business.priceMin!==undefined && business.priceMin< maximum){
                return false;
            }
        }
        return true;

    });
    //Active Filter count
    const activeFilterCount=[
        selectedCategory !=="All",
        selectedAvailability!=="All",
        !!locationFilter,
        !!minPrice,
        !!maxPrice,
        verifiedOnly,

    ].filter(Boolean).length;

//Seller Card
   const SellerCard = ({business }: {business: SearchResult}) => {
    const categoryText=business.categories?.map((item)=>item.category.name).filter(Boolean).join(", ") || "Local Business";
    const initials=business.name.split("").slice(0,2).map((word)=>word[0]).join("").toUpperCase();

    return (
        <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft sm:p-5">
            {/*Seller Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                    {/*Avatar */}
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-[#9F2D18]">
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <Link href={`/seller/${business.id}`} className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-sm font-bold sm:text-base">
                            {business.name}
                        </span>
                        <VerificationMark verification={business.verification} variant="inline"/>
                        </Link>
                        <p className="mt-1 text-xs text-muted">{categoryText}</p>
                        {business.location?.area &&(<div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500"><MapPin size={13} className="text-[#FF5A36]"/><span className="truncate">{business.location.area}</span></div>)}
                    </div>
                </div>
                {/*Availability */}
                <div className="flex shrink-0 items-center gap-1.5">
                    <AvailabilityDot status={business.availability}/>
                    <span className="hidden text-[11px] text-gray-500 sm:block">
                        {business.availability?.toLowerCase().replace("_","") || "Ask seller"}
                    </span>
                </div>
            </div>
            {/*Price */}
            {(business.priceMin !== undefined || business.priceMax!== undefined) &&(<p className="mt-3 text-sm font-semibold text-gray-700">
                {business.priceMin !== undefined && business.priceMax !== undefined? `N${business.priceMin.toLocaleString()}-N${business.priceMax.toLocaleString()}`:business.priceMin!==undefined? `From N${business.priceMin?.toLocaleString()}`:`Up to N${business.priceMax?.toLocaleString()}`}
            </p>)}
            {/*Contacts */}
            {!! business.socialLinks?.length &&(<div className="mt-3 flex flex-wrap gap-1.5">
                {business.socialLinks.map((social) =>(
                    <ContactButton key={`${social.platform} -${social.handle}`} platform={social.platform} handle={social.handle} onClick={()=> contact(business.id,social.platform)} /> 
                )
                )}
            </div>
        )}
        {/*View Seller */}
        <Link 
            href={`/seller/${business.id}`}
            className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs font-semibold text-[#9F2D18]">View Seller <ChevronRight size={15}/></Link>
        </article>
    )
   };

    return (
        <main className="min-h-screen bg-[#FFF7ED] text-[#17202A]">
             <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
                {/*Desktop SideBar */}
                <aside className="hidden w-[225px] shrink-0 border-r border-orange-100 bg-white/50 px-4 py-6 lg:flex lg:flex-col">
                {/*Logo */}
                <Link 
                  href="/" className="mb-8 flex items-center gap-2.5 px-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-[#FFFFFF] shadow-sm">
                        <Store size={21} />
                    </div>
                    <div>
                        <p className="text-base font-bold tracking-tight">Remarket</p>
                        <p className="text-[10px] text-muted">Find it nearby</p>
                    </div>
                  </Link>
                  {/*Navigations */}
                  <nav className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item)=>{
                        const Icon=item.icon;
                        const active = item.label ==="Search";
                        return(
                            <Link key={item.label} href={item.href} className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${ active ?"bg-[#FF5A36] text-[#FFFFFF] shadow-sm":"text-gray-700 hover:bg-orange-50 hover:text-[#9F2D18]"}`}>
                                <Icon size={19}/>{item.label}
                            </Link>
                        );
                    }
                    )}
                  </nav>
                  {/*Divider */}
                  <div className="my-5 border-t border-gray-200"/>
                  {/*
                  Categories */}
                  <div>
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Categories</p>
                    <div className="mt-3 flex flex-col gap-1">
                        {categories.map((category)=>{
                            const style = CATEGORY_STYLE[category.name];
                            return(
                                <Link key={category.id} href={`/shop?category=${encodeURIComponent(category.name)}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-gray-700 transition hover:bg-white">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{backgroundColor:style?.bg??"#F3F4F6",}}>
                                        {style?.icon}
                                    </span>
                                    {category.name}
                                </Link>
                            );
                        }
                        )}
                        <Link href="/shop" className="flex items-center gap-3 rounded-xl px-3 px-2.5 text-xs text-gray-600 transition hover:bg-white">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100"><MoreHorizontal className="h-6 w-6"/></span>
                        More
                        </Link>
                        </div>
                    </div> 
                        {/*Request Card */}
                       
                </aside>
                {/*Main */}
                <div className="min-w-0 flex-1">
                    <header className="hidden h-[72px] items-center justify-between border-b border-orange-100 bg-white/40 px-7 lg:flex">
                    <div className="flex items-center gap-7">
                        <span className="text-sm font-semibold text-[#9F2D18]">Search</span>
                        <Link href="/shop" className="text-sm text-gray-600 hover:text-[#17202A]">Shop</Link>
                        <Link href="/request" className="text-sm text-gray-600 hover:text-[#17202A]">Requests</Link>
                           <Link href="/saved" className="text-sm text-gray-600 hover:text-[#17202A]">Saved</Link>

                    </div>
                    <Link href="/request" className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-90">
                            Request Something
                    </Link>
                    </header>

                    {/**MOBILE HEADER */}
                    <header className="flex items-center justify-between px-4 pt-5 lg:hidden">
                        <Link href="/" className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                            <Store size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold">
                                Re <span className="text-[#9F2D18]">Market</span>
                            </p>
                            <p className="text-[10px] text-muted">
                                Find it nearby
                            </p>
                        </div>
                        </Link>

                        <Link href="/request" className="rounded-full border border-orange-100 bg-white px-3.5 py-2 text-xs font-semibold shadow-sm">
                        Request
                        
                        </Link>
                    </header>

                    {/**CONTENT */}
                    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
                        <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-[#17202A]">
                        <ChevronRight size={24} className="rotate-180"/>
                        Back Home
                        </Link>
                        {/**SEARCH HERO */}
                        <section className="relative overflow-hidden rounded-3xl bg-[#FF5A36] px-5 px-6 text-white shadow-card sm:px-7 sm:py-7">
                            <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-white/10"/>
                            <div className="pointer-events-none absolute -bottom-20 right-20 h-40 w-40 rounded-full bg-white/10"/>
                            <div className="relative">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
                                    Local Search
                                </p>
                                <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                                    Find what you need
                                </h1>
                                <p className="mt-1.5 max-w-xl text-sm leading-6 text-white/85">
                                Search local sellers, products and services near you
                                </p>
                                {/**SEARCH */}
                                <form onSubmit={submitSearch} className="mt-5 flex w-full items-center gap-2 rounded-full bg-white p-1.5">
                                    <Search size={18} className="ml-3 shrink-0 text-gray-400"/>
                                    <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="what are you looking for ?" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400"/>
                                    <button type="submit" disabled={!searchInput.trim()} className="rounded-full bg-[#FF5A36] px-5 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                                        Search
                                    </button>
                                </form>
                            </div>
                        </section>
                        {/**RESULT HEADER */}
                        <div className="mt-7">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-bold sm:text-xl">
                                        {q? `Results for ${q}` : "Search results"}
                                    </h2>
                                    {!loading && (<p className="mt-1 text-xs text-muted">
                                        {filteredResults.length} {""} {filteredResults.length === 1 ? "seller" : "sellers"} {""} found
                                    </p>)}
                                </div>
                                {/**FILTER */}
                                <button type="button" onClick={() => setFilterOpen(true)} className="relative flex shrink-0 items-center gap-1.5 rounded-full border border-orange-100 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 shadow-sm transition hover:border-[#FF5A36] hover:text-[#9F2D18]">
                                        <SlidersHorizontal size={14} /> 
                                        Filter { activeFilterCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF5A36] px-1 text-[9px] font-bold text-white">{activeFilterCount}</span>}
                                </button>
                            </div>

                            {/**CATEGORY CHIPS */}
                            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                                <button type="button" onClick={() => setSelectedCategory("All")} className={ `flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                                selectedCategory === "All" ? "bg-[#FF5A36] text-white": "border border-orange-100 bg-white text-gray-600 hover:border-[#FF5A36]"}`}>All</button>
                                { categories.map((category) => {
                                    const style = CATEGORY_STYLE[category.name];
                                    const active = selectedCategory === category.name;
                                    return( 
                                        <button key={category.id} type="button" onClick={()=> setSelectedCategory(active ? "All": category.name)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition ${
                                            active ? "border-[#FF5A36] bg-orange-50 text-[#9F2D18]" : "border-orange-100 bg-white text-gray-600 hover:border-[#FF5A36]"}`}>
                                                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]" style={{ backgroundColor: style?.bg ?? "#F3F4F6",}}>
                                                    {style?.icon ?? "."}
                                                </span>
                                                {category.name}
                                            </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/**LOADING */}
                        {loading && (<div className="mt-5 flex items-center justify-center rounded-2xl border border-orange-100 bg-white py-16 shadow-card"><div className="flex items-center gap-2 text-sm text-muted"> <Loader2 size={17} className="animate-spin text-[#FF5A36]"/>Searching local</div></div>)}
                        {/**EMPTY */}
                        {!loading && filteredResults.length === 0 && (<div className="mt-5 rounded-2xl border border-orange-100 bg-white px-6 py-12 text-center shadow-card"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#FF5A36]"><Search size={24}/></div> <h3 className="mt-5 text-base font-bold">No seller found</h3><p className="mx-auto mt-2 max-w-m text-sm leading-6 text-muted"> {results.length > 0 ? "Try changing your filters or search for something else": "We couldn't find a seller matching your search"}</p>{activeFilterCount > 0 && (<button type="button" onClick={clearFilters} className="mt-4 text-ms font-semibold text-[#9F2D18] underline">Clear filters</button>)}
                        <div>
                            <Link href={`/request${
                                q ? `?q=${encodeURIComponent(q)}`:""
                                }`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-semibold text-white">
                                    Submit a request
                                    <ChevronRight size={15} />
                                </Link>
                            </div></div>)}
                        {/**RESULTS */}
                        {!loading &&  filteredResults.length > 0 && (<div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {filteredResults.map((business) => <SellerCard key={business.id} business={business}/>)}
                            </div>)}
                        
                        {/**REQUEST CTA */}
                        {!loading && (<section className="mt-7 rounded-2xl border border-[#FF5A36]/100 bg-[#FF5A36]/9 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
                            <div>
                                <p className="text-sm font-bold">
                                    Can't find what you need ?
                                </p>
                                <p className="mt-1 text-xs leading-5 text-muted">Tell us what you are looking for and we will help you find matching local sellers</p>
                            </div>
                            <Link href={`/request${
                            q ? `?q=${encodeURIComponent(q)}`:""}`}
                            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-semibold text-white sm:mt-0">
                                Submit a request
                                <ChevronRight size={15} />
                            </Link>
                            
                        </section>)}
                        <footer className="mt-10 hidden pb-5 text-center text-[11px] text-gray-400 lg:block">
                            LocalMarket . Find it nearby
                        </footer>
                    </div>
                </div>
             </div>
             {/**MOBILE BOTTOM NAV */}
             <nav 
                className="fixed inset-x-0 bottom-0 z-50 border-t border-[#FF5A36]/100 bg-white/95 px-3 pb-[max(10px, safe-area-inset-bottom)] pt-2 backdrop-blur lg:hidden">
                    <div className="mx-auto flex max-w-md items-center justify-around">
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            return(
                                <Link 
                                key={item.label}
                                href={item.href}
                                className={`
                                    flex
                                    min-w-[64px]
                                    flex-col
                                    items-center
                                    px-3
                                    py-1.5
                                    text-[10px]
                                    font-medium
                                    transition ${
                                    item.label === "Search" ? "text-[#9F2D18]": "text-gray-400 hover:text-[#9F2D18]"
                                    }
                                    `}>
                                        <Icon size={21} />
                                        <span>
                                            {item.label}
                                        </span>
                                    </Link>
                            );
                        })}
                    </div>
                </nav>
                
        </main>
       
    )
}
