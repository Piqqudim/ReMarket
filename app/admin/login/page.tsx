"use client";
import React, {  useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Store, StoreIcon } from "lucide-react";


export default function AdminLogin(){
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error,setError] = useState("");
     const [loading, setLoading] = useState(false);
     const [showPassword,setShowPassword]=useState(false);
    const router = useRouter();
   

    const submit = async(e: React.SyntheticEvent<HTMLFormElement>)=> {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await signIn("credentials", {email, password, redirect: false});
            if(res?.error){
                setError("Invalid email or password");
                return;
            }
            router.push("/admin");
            router.refresh();
        }
        catch {
            setError("Something went wrong. Please try again");
        } 
        finally {
            setLoading(false);
        }
    };
        return (
          <main className="relative min-h-screen overflow-hidden bg-[#FFF0DC] flex items-center justify-center px4 py-10">
            {/*Decorative Background - Top-left coral shape */}
            <div className="absolute top-24 left-20 w-72 h-72 rounded-full bg-[FF9A6B] opacity-90"/>
            {/* Top right dots*/ }
            <div className="absolute top-24 right-16 grid grid-cols-4 gap-3 opacity-50">
                {Array.from({length:16}).map((_,index)=>(<span key={index} className="w-2 h-2 rounded-full bg-[#F89B68]"/>))}
            </div>
            {/* Bottom-left dots*/}
            <div className="absolute bottom-24 left-16 grid grid-cols-4 gap-3 opacity-50 ">
                {Array.from({length:18}).map((_,index)=>(<span key={index} className="w-2 h-2 rounded-full bg-[#F89B68]"/>))}
            </div>
            {/* Bottom-right coral shape */}
            <div className="absolute bottom-1 right-1 w-92 h-72 rounded-[50%] bg-[#FF9A6B] rotate-[-20deg] opacity-90"/>
             {/**Main Content */}
            <section className="relative z-15 w-full max-w-[655px] flex flex-col items-center">
                {/*Brand */}
                <div className="flex flex-col items-center text-center mb-10">
               {/*Store Icon*/}
                    <div className="w-28 h-28 rounded-[28px] bg-[#FF563F] flex items-center justify-center shadow-[0_12px_30px_rgba(255,86,63,0.25)] mb-5">
                     <i className="ti ti-building-store text-white text-[58px]"><Store className="h-20 w-20"/></i>
                    </div>
                  {/**Brand Name */}
                    <h1 className="text-[52px] leading-none font-semibold tracking[-2px] text-[#111C27]">
                      Re<span className="text-[#FF563F]">Market</span>
                    </h1>
                      <p className="mt-4 text-[22px] text-[#718096] font-normal">Marketplace Administration</p>
                </div>
               {/*Login Card*/}
                <div className="w-full bg-white rounded-[28px] px-10 py-11 sm:px-14 sm:py-12 shadow-[0_20px_60px_rgba(80,50,20,0.10)]">
                     {/*Header*/}
                    <div className="mb-9">
                        <h2 className="text-[32px] leading-tight font-semibold text-[#111C27]">Welcome back</h2>
                        <p className="mt-3 text-[19px] text-[#718096]">Sign in to manage your marketplace</p>
                    </div>
                    {/*Form */}
                    <form onSubmit={submit} className="space-y-7">
                    {/*Email  */}
                    <div>
                        <label htmlFor="email" className="block mb-3 text-[17px] font-semibold text-[#111C27]">Email address</label>
                        <div className="relative">
                            <i className="ti ti-mail absolute left-5 top-1/2-translate-y-1/2 text-[25px] text-[#FF694F]"/>
                            <input id="email" type="email" placeholder="you@business.com" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" required 
                            className="w-full h-[64px] rounded-[14px] border border-[#D9DEE5] bg-white pl-14 pr-5 text-[17px] text-[#111C27] placeholder:text[#8491A3] outline-none
                            transition-all
                            focus:border-[#FF694F]
                            focus:ring-4
                            focus:ring-[#FF69F]/10"/>
                        </div>
                    </div>
                     {/*Password */}
                    <div>
                         <label htmlFor="password" className="block mb-3 text-[17px] font-semibold text-[#111C27]">Password</label>
                        <div className="relative">
                        <i className="ti ti-lock absolute left-5 top-1/2-translate-y-1/2 text-[25px] text-[#FF694F]"/>
                        <input id="password" type={showPassword?"text":"password"} placeholder="Enter your password" value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="current-password" required className="w-full h-[64px] rounded-[14px] border border-[#D9DEE5] bg-white pl-14 pr-14 text-[17px] text-[#111C27] placeholder:text-[#8491A3] outline-none transition-all focus:border-[#FF694F] focus:ring-4 focus:ring-[FF694F]/10"/>
                        {/*Password visibility */}
                         <button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?"Hide Password":"Show Password"} className="absolute right-5 top-1/2-translate-y-1/2 text-[#718096] hover:text-[#111C27] transition-colors">
                            <i className={`ti ${showPassword? "ti-eye-off":"ti-eye"} text-[25px]`}/>
                         </button>
                        </div>  
                    </div>
                    {error && (<div className="flex items-center gap-4 rounded-[14px] border border-[#FFB8B0] bg-[#FFF0EE] px-5 py-4"><div className="w-8 h-8 shrink-0 rounded-full bg-[#EF3F3F] text-white flex items-center justify-center"><i className="ti ti-exclamation-mark text-[20px]"/></div>
                        <p className="text-[16px] text-[#E33B22]">{error}</p>
                    </div>)}
                    {/**Login Button */}
                    <button type="submit" disabled={loading} className="w-full h-[66px] rounded-[14px] bg-[#FF563F] text-white text-[19px] font-semibold flex items-center justify-center gap-3 shadow-[0_10px_25px_rgba(255,86,63,0.22)] transition-all hover:bg-[#F44D37] hover:shadow-[0_14px_30px_rgba(255,86,63,0.28)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed">
                       { loading ? (<><i className="ti ti-loader-2 animate-spin text-[24px]"/>Signing in...</>): (<> Log in <i className="ti ti-arrow-right text-[25px]"/></>)}
                    </button>
                </form>
                {/**Footer */}
                <div className="flex items-center gap-5 mt-10">
                    <div className="h-px bg-[#D9DEE5] flex-1"/>
                    <p className="whitespace-nowrap text-[15px] text-[#718096]">
                        Powered by your local marketplace
                    </p>
                    <div className="h-px bg-[#D9DEE5] flex-1"/>
                </div>
                    
            </div> 
               
            </section>
              
          </main>
        );
      
}
           