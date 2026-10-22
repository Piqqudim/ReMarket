"use client";

import {
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type CSSProperties,
} from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Store,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  LoaderCircle,
  CircleAlert,
  MapPin,
  ShoppingBag,
  Package,
  Sparkles,
  ArrowUpRight,
  ScanLine,
} from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const backdropRef = useRef<HTMLElement | null>(null);
  const router = useRouter();

  function handleBackdropMove(event: MouseEvent<HTMLElement>) {
    const element = backdropRef.current;
    if (!element) return;

    const bounds = element.getBoundingClientRect();
    const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5;

    element.style.setProperty("--pointer-x", `${normalizedX * 24}px`);
    element.style.setProperty("--pointer-y", `${normalizedY * 20}px`);
    element.style.setProperty("--tilt-x", `${normalizedX * 4}deg`);
    element.style.setProperty("--tilt-y", `${normalizedY * -4}deg`);
  }

  function resetBackdropMove() {
    const element = backdropRef.current;
    if (!element) return;
    element.style.setProperty("--pointer-x", "0px");
    element.style.setProperty("--pointer-y", "0px");
    element.style.setProperty("--tilt-x", "0deg");
    element.style.setProperty("--tilt-y", "0deg");
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    setError("");

    if (!cleanEmail) {
      setError("Email address is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
        callbackUrl: "/admin",
      });

      if (!result || result.error || result.ok !== true) {
        setError("Invalid email or password.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch (loginError) {
      console.error("Admin login error:", loginError);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const backdropStyle = {
    "--pointer-x": "0px",
    "--pointer-y": "0px",
    "--tilt-x": "0deg",
    "--tilt-y": "0deg",
  } as CSSProperties;

  return (
    <main
      ref={backdropRef}
      style={backdropStyle}
      onMouseMove={handleBackdropMove}
      onMouseLeave={resetBackdropMove}
      className="admin-login-root relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FFF5EA] px-4 py-8 sm:px-6 sm:py-10"
    >
      {/* Animated local-market backdrop. All elements are decorative and never block the form. */}
      <div className="admin-ambient pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="admin-grid absolute inset-0" />
        <div className="admin-spotlight admin-spotlight-one absolute" />
        <div className="admin-spotlight admin-spotlight-two absolute" />
        <div className="admin-spotlight admin-spotlight-three absolute" />
        <div className="admin-horizon absolute inset-x-0 bottom-0" />

        <div className="admin-orbit admin-orbit-one absolute" />
        <div className="admin-orbit admin-orbit-two absolute" />
        <div className="admin-orbit admin-orbit-three absolute" />

        <svg
          className="admin-network absolute inset-0 h-full w-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <linearGradient id="adminPathGradient" x1="0" y1="0" x2="1440" y2="900" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF9A6B" stopOpacity="0" />
              <stop offset="0.48" stopColor="#FF654A" stopOpacity="0.68" />
              <stop offset="1" stopColor="#F4B65F" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="adminNodeGlow">
              <stop stopColor="#FF704F" stopOpacity="0.95" />
              <stop offset="1" stopColor="#FF704F" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path className="admin-route admin-route-one" d="M-60 650 C 170 510, 210 730, 405 570 S 710 330, 850 490 S 1120 680, 1500 370" stroke="url(#adminPathGradient)" strokeWidth="1.5" />
          <path className="admin-route admin-route-two" d="M-40 245 C 195 355, 280 155, 455 280 S 755 470, 945 250 S 1225 135, 1480 250" stroke="url(#adminPathGradient)" strokeWidth="1.2" />
          <path className="admin-route admin-route-three" d="M220 950 C 330 720, 520 760, 610 605 S 800 365, 1040 470 S 1300 620, 1510 500" stroke="url(#adminPathGradient)" strokeWidth="1.1" />
          {[
            [140, 580], [305, 622], [455, 536], [630, 416], [850, 490],
            [1060, 555], [1275, 470], [225, 280], [445, 273], [670, 372],
            [930, 270], [1150, 205], [360, 790], [610, 605], [1010, 462],
          ].map(([cx, cy], index) => (
            <g key={index} className={`admin-node admin-node-${index % 5}`}>
              <circle cx={cx} cy={cy} r="18" fill="url(#adminNodeGlow)" />
              <circle cx={cx} cy={cy} r="3" fill="#FF7855" />
              <circle className="admin-node-ring" cx={cx} cy={cy} r="7" stroke="#FF9268" strokeOpacity="0.55" />
            </g>
          ))}
        </svg>

        {/* Floating market signals on wider screens */}
        <div className="admin-float-card admin-float-card-left absolute">
          <div className="admin-float-icon"><MapPin size={17} /></div>
          <div>
            <p className="admin-float-eyebrow">LOCAL DISCOVERY</p>
            <p className="admin-float-title">Places connect here</p>
            <div className="admin-mini-route"><span /><span /><span /><span /><span /></div>
          </div>
          <span className="admin-float-corner"><ArrowUpRight size={14} /></span>
        </div>

        <div className="admin-float-card admin-float-card-right absolute">
          <div className="admin-float-icon admin-float-icon-gold"><ShoppingBag size={17} /></div>
          <div>
            <p className="admin-float-eyebrow">MARKET SIGNAL</p>
            <p className="admin-float-title">Products in motion</p>
            <div className="admin-signal-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <span className="admin-pulse-dot" />
        </div>

        <div className="admin-floating-glyph admin-glyph-bag absolute"><ShoppingBag size={23} strokeWidth={1.5} /></div>
        <div className="admin-floating-glyph admin-glyph-package absolute"><Package size={21} strokeWidth={1.5} /></div>
        <div className="admin-floating-glyph admin-glyph-pin absolute"><MapPin size={20} strokeWidth={1.7} /></div>
        <div className="admin-floating-glyph admin-glyph-spark absolute"><Sparkles size={18} strokeWidth={1.7} /></div>
        <div className="admin-scan-beam absolute inset-x-0" />
      </div>

      {/* Main content */}
      <section className="admin-login-content relative z-[15] flex w-full max-w-[655px] flex-col items-center">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
          <div className="admin-brand-mark relative mb-5 flex h-24 w-24 items-center justify-center rounded-[26px] bg-[#FF563F] shadow-[0_12px_30px_rgba(255,86,63,0.25)] sm:h-28 sm:w-28">
            <div className="admin-brand-halo absolute inset-[-9px] rounded-[32px]" aria-hidden="true" />
            <Store className="relative z-[1] h-14 w-14 text-white sm:h-16 sm:w-16" strokeWidth={1.8} aria-hidden="true" />
            <span className="admin-brand-spark absolute right-2 top-2" aria-hidden="true"><Sparkles size={14} /></span>
          </div>

          <h1 className="text-[42px] font-semibold leading-none tracking-[-2px] text-[#111C27] sm:text-[52px]">
            Re<span className="text-[#FF563F]">Market</span>
          </h1>

          <p className="mt-3 text-[18px] font-normal text-[#718096] sm:mt-4 sm:text-[22px]">
            Marketplace Administration
          </p>
          <div className="admin-access-chip mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em]">
            <ScanLine size={13} strokeWidth={2.2} />
            Admin control room
            <span className="admin-chip-light" />
          </div>
        </div>

        {/* Login card */}
        <div className="admin-login-card relative w-full rounded-[28px] border border-white/80 bg-white/95 px-6 py-8 shadow-[0_24px_80px_rgba(93,57,35,0.14)] backdrop-blur-xl sm:px-14 sm:py-12">
          <div className="admin-card-topline absolute inset-x-8 top-0 h-[2px] rounded-b-full" aria-hidden="true" />
          <div className="mb-8 sm:mb-9">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#E36B4A]">Secure administrator access</p>
            <h2 className="text-[28px] font-semibold leading-tight text-[#111C27] sm:text-[32px]">
              Welcome back
            </h2>
            <p className="mt-3 text-[17px] text-[#718096] sm:text-[19px]">
              Sign in to manage your marketplace
            </p>
          </div>

          <form onSubmit={submit} aria-busy={loading} className="space-y-6 sm:space-y-7">
            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]">
                Email address
              </label>
              <div className="admin-input-wrap relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F]" strokeWidth={2} />
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); if (error) setError(""); }}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  required
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-[64px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-14 pr-5 text-[17px] text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]">
                Password
              </label>
              <div className="admin-input-wrap relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F]" strokeWidth={2} />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); if (error) setError(""); }}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-[64px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-14 pr-14 text-[17px] text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#718096] transition-colors hover:text-[#111C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF694F] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" strokeWidth={2} /> : <Eye aria-hidden="true" className="h-5 w-5" strokeWidth={2} />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" aria-live="polite" className="flex items-start gap-4 rounded-[14px] border border-[#FFB8B0] bg-[#FFF0EE] px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EF3F3F] text-white">
                  <CircleAlert aria-hidden="true" className="h-4 w-4" strokeWidth={2.3} />
                </div>
                <p className="min-w-0 flex-1 break-words pt-1 text-[15px] text-[#E33B22] sm:text-[16px]">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="admin-login-button group relative flex h-[66px] w-full items-center justify-center gap-3 overflow-hidden rounded-[14px] bg-[#FF563F] text-[18px] font-semibold text-white shadow-[0_10px_25px_rgba(255,86,63,0.22)] transition-all hover:bg-[#F44D37] hover:shadow-[0_14px_30px_rgba(255,86,63,0.28)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF563F]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:text-[19px]"
            >
              <span className="admin-button-shimmer absolute inset-y-0 left-[-60%] w-[45%] skew-x-[-20deg] bg-white/15" aria-hidden="true" />
              {loading ? (
                <><LoaderCircle aria-hidden="true" className="relative h-6 w-6 animate-spin" strokeWidth={2} /> <span className="relative">Signing in...</span></>
              ) : (
                <><span className="relative">Log in</span><ArrowRight aria-hidden="true" className="relative h-6 w-6 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2} /></>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-4 sm:mt-10 sm:gap-5">
            <div aria-hidden="true" className="h-px flex-1 bg-[#D9DEE5]" />
            <p className="whitespace-nowrap text-[12px] text-[#718096] sm:text-[15px]">Powered by your local marketplace</p>
            <div aria-hidden="true" className="h-px flex-1 bg-[#D9DEE5]" />
          </div>
        </div>

        <p className="mt-5 text-center text-[10px] font-medium tracking-wide text-[#9A7E70] sm:text-xs">
          ReMarket administration · Local commerce, connected
        </p>
      </section>

      <style jsx global>{`
        .admin-login-root {
          --pointer-x: 0px;
          --pointer-y: 0px;
          --tilt-x: 0deg;
          --tilt-y: 0deg;
          isolation: isolate;
          background-image: radial-gradient(ellipse at 50% 35%, rgba(255,255,255,.88) 0%, rgba(255,245,234,.4) 43%, rgba(255,231,208,.4) 100%);
        }
        .admin-ambient { z-index: 0; overflow: hidden; }
        .admin-grid {
          opacity: .36;
          background-image: linear-gradient(rgba(204,113,75,.095) 1px, transparent 1px), linear-gradient(90deg, rgba(204,113,75,.095) 1px, transparent 1px);
          background-size: 54px 54px;
          mask-image: radial-gradient(ellipse at center, black 2%, transparent 79%);
          transform: translate3d(var(--pointer-x), var(--pointer-y), 0);
          transition: transform .35s ease-out;
        }
        .admin-spotlight { width: 29rem; height: 29rem; border-radius: 9999px; filter: blur(78px); opacity: .47; will-change: transform; }
        .admin-spotlight-one { top: -10rem; left: -8rem; background: rgba(255,154,107,.5); animation: adminGlowDriftA 17s ease-in-out infinite alternate; }
        .admin-spotlight-two { right: -12rem; top: 18%; background: rgba(255,106,77,.28); animation: adminGlowDriftB 20s ease-in-out infinite alternate; }
        .admin-spotlight-three { bottom: -17rem; left: 33%; width: 35rem; height: 28rem; background: rgba(255,196,123,.4); animation: adminGlowDriftC 22s ease-in-out infinite alternate; }
        .admin-horizon { height: 28%; background: linear-gradient(0deg, rgba(255,224,194,.42), transparent); opacity: .75; }
        .admin-orbit { left: 50%; top: 48%; border: 1px solid rgba(246,145,101,.14); border-radius: 50%; transform: translate(-50%,-50%) rotate(-18deg); }
        .admin-orbit-one { width: min(88vw, 1020px); height: min(64vw, 520px); animation: adminOrbit 38s linear infinite; }
        .admin-orbit-two { width: min(74vw, 850px); height: min(52vw, 410px); border-style: dashed; border-color: rgba(246,145,101,.17); animation: adminOrbitReverse 52s linear infinite; }
        .admin-orbit-three { width: min(58vw, 690px); height: min(40vw, 320px); border-color: rgba(255,91,62,.11); transform: translate(-50%,-50%) rotate(22deg); }
        .admin-network { opacity: .55; transform: translate3d(var(--pointer-x), var(--pointer-y), 0); transition: transform .4s ease-out; }
        .admin-route { stroke-dasharray: 8 13; animation: adminRouteFlow 24s linear infinite; }
        .admin-route-two { animation-duration: 30s; animation-direction: reverse; }
        .admin-route-three { animation-duration: 35s; }
        .admin-node { animation: adminNodeFloat 7s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .admin-node-1 { animation-delay: -1.7s; }
        .admin-node-2 { animation-delay: -3.2s; }
        .admin-node-3 { animation-delay: -4.6s; }
        .admin-node-4 { animation-delay: -2.4s; }
        .admin-node-ring { transform-box: fill-box; transform-origin: center; animation: adminNodePulse 4s ease-out infinite; }
        .admin-float-card {
          pointer-events: none;
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 218px;
          padding: 14px 15px;
          border: 1px solid rgba(255,255,255,.88);
          border-radius: 17px;
          background: linear-gradient(135deg, rgba(255,255,255,.78), rgba(255,247,239,.48));
          box-shadow: 0 18px 45px rgba(153,92,60,.09), inset 0 1px 0 rgba(255,255,255,.8);
          backdrop-filter: blur(14px);
          transform: perspective(900px) rotateX(var(--tilt-y)) rotateY(var(--tilt-x));
          transition: transform .25s ease-out, box-shadow .3s ease;
        }
        .admin-float-card-left { left: max(2.2rem, calc(50% - 590px)); top: 39%; animation: adminCardFloatA 8s ease-in-out infinite; }
        .admin-float-card-right { right: max(2.2rem, calc(50% - 590px)); top: 53%; animation: adminCardFloatB 9s ease-in-out infinite; }
        .admin-float-icon { display:flex; align-items:center; justify-content:center; flex:none; width:37px; height:37px; border-radius:12px; color:#F05F42; background:rgba(255,103,76,.11); border:1px solid rgba(255,103,76,.12); }
        .admin-float-icon-gold { color:#BC7D31; background:rgba(238,178,86,.14); border-color:rgba(238,178,86,.18); }
        .admin-float-eyebrow { color:#A77D68; font-size:8px; font-weight:800; letter-spacing:.17em; line-height:1.3; }
        .admin-float-title { margin-top:4px; color:#28333D; font-size:12px; font-weight:700; letter-spacing:-.015em; white-space:nowrap; }
        .admin-float-corner { margin-left:auto; align-self:flex-start; color:#D89577; }
        .admin-mini-route { display:flex; align-items:center; gap:5px; margin-top:8px; }
        .admin-mini-route span { display:block; width:5px; height:5px; border-radius:50%; background:#F27B59; box-shadow:0 0 8px rgba(242,123,89,.28); }
        .admin-mini-route span:nth-child(2), .admin-mini-route span:nth-child(4) { opacity:.55; }
        .admin-signal-bars { display:flex; align-items:flex-end; gap:3px; height:12px; margin-top:5px; }
        .admin-signal-bars i { display:block; width:4px; border-radius:5px; background:linear-gradient(0deg,#FF9C6A,#F45E45); animation:adminSignal 1.7s ease-in-out infinite alternate; }
        .admin-signal-bars i:nth-child(1), .admin-signal-bars i:nth-child(6) { height:5px; }
        .admin-signal-bars i:nth-child(2), .admin-signal-bars i:nth-child(8) { height:8px; animation-delay:-.5s; }
        .admin-signal-bars i:nth-child(3), .admin-signal-bars i:nth-child(5) { height:11px; animation-delay:-1s; }
        .admin-signal-bars i:nth-child(4), .admin-signal-bars i:nth-child(7) { height:7px; animation-delay:-.7s; }
        .admin-pulse-dot, .admin-chip-light { width:6px; height:6px; flex:none; display:inline-block; border-radius:9999px; background:#E97A50; box-shadow:0 0 0 4px rgba(233,122,80,.12); animation:adminDotPulse 2.4s ease-in-out infinite; }
        .admin-floating-glyph { display:flex; align-items:center; justify-content:center; width:46px; height:46px; border:1px solid rgba(255,255,255,.8); border-radius:15px; color:rgba(207,103,67,.72); background:rgba(255,255,255,.35); box-shadow:0 12px 28px rgba(147,85,54,.06); backdrop-filter:blur(10px); }
        .admin-glyph-bag { left:18%; top:20%; animation:adminGlyphFloatA 11s ease-in-out infinite; }
        .admin-glyph-package { right:17%; bottom:20%; animation:adminGlyphFloatB 12s ease-in-out infinite; }
        .admin-glyph-pin { right:22%; top:19%; width:38px; height:38px; border-radius:13px; animation:adminGlyphFloatC 10s ease-in-out infinite; }
        .admin-glyph-spark { left:17%; bottom:21%; width:36px; height:36px; border-radius:12px; animation:adminGlyphFloatB 9s ease-in-out infinite reverse; }
        .admin-scan-beam { top:-15%; height:15%; background:linear-gradient(180deg,transparent,rgba(255,255,255,.22),transparent); opacity:.6; animation:adminScan 15s linear infinite; }
        .admin-login-content { animation:adminContentEnter .7s cubic-bezier(.2,.75,.25,1) both; }
        .admin-brand-mark { isolation:isolate; box-shadow:0 15px 36px rgba(255,86,63,.24), 0 0 0 8px rgba(255,255,255,.36); }
        .admin-brand-halo { z-index:-1; border:1px solid rgba(255,104,75,.34); animation:adminHalo 4s ease-out infinite; }
        .admin-brand-spark { color:white; opacity:.92; animation:adminSpark 3s ease-in-out infinite; }
        .admin-access-chip { color:#A76449; border:1px solid rgba(234,147,107,.22); background:rgba(255,255,255,.55); box-shadow:inset 0 1px 0 rgba(255,255,255,.75); }
        .admin-card-topline { background:linear-gradient(90deg,transparent,#FFB69B,#FF6649,#F9CA83,transparent); }
        .admin-login-card { box-shadow:0 24px 80px rgba(93,57,35,.14), 0 4px 18px rgba(255,255,255,.65) inset; }
        .admin-input-wrap input { transition:border-color .2s ease, box-shadow .2s ease, background-color .2s ease; }
        .admin-input-wrap:focus-within > svg { filter:drop-shadow(0 0 5px rgba(255,105,79,.2)); }
        .admin-login-button { box-shadow:0 10px 25px rgba(255,86,63,.23), inset 0 1px 0 rgba(255,255,255,.2); }
        .admin-button-shimmer { animation:adminButtonShimmer 6.5s ease-in-out infinite; }
        @keyframes adminGlowDriftA { from { transform:translate3d(0,0,0) scale(.92); } to { transform:translate3d(95px,55px,0) scale(1.09); } }
        @keyframes adminGlowDriftB { from { transform:translate3d(0,0,0) scale(1); } to { transform:translate3d(-75px,80px,0) scale(.9); } }
        @keyframes adminGlowDriftC { from { transform:translate3d(-30px,0,0) scale(.94); } to { transform:translate3d(55px,-40px,0) scale(1.08); } }
        @keyframes adminOrbit { from { rotate:0deg; } to { rotate:360deg; } }
        @keyframes adminOrbitReverse { from { rotate:360deg; } to { rotate:0deg; } }
        @keyframes adminRouteFlow { to { stroke-dashoffset:-240; } }
        @keyframes adminNodeFloat { 0%,100% { opacity:.67; scale:1; } 50% { opacity:1; scale:1.12; } }
        @keyframes adminNodePulse { 0% { opacity:.7; scale:.7; } 75%,100% { opacity:0; scale:1.9; } }
        @keyframes adminCardFloatA { 0%,100% { translate:0 0; } 50% { translate:0 -10px; } }
        @keyframes adminCardFloatB { 0%,100% { translate:0 0; } 50% { translate:0 9px; } }
        @keyframes adminSignal { from { opacity:.45; } to { opacity:1; } }
        @keyframes adminDotPulse { 0%,100% { box-shadow:0 0 0 3px rgba(233,122,80,.1); } 50% { box-shadow:0 0 0 6px rgba(233,122,80,.04); } }
        @keyframes adminGlyphFloatA { 0%,100% { transform:translate3d(0,0,0) rotate(-5deg); } 50% { transform:translate3d(8px,-13px,0) rotate(4deg); } }
        @keyframes adminGlyphFloatB { 0%,100% { transform:translate3d(0,0,0) rotate(5deg); } 50% { transform:translate3d(-9px,-12px,0) rotate(-4deg); } }
        @keyframes adminGlyphFloatC { 0%,100% { transform:translate3d(0,0,0); } 50% { transform:translate3d(0,10px,0); } }
        @keyframes adminScan { 0% { transform:translateY(0); } 100% { transform:translateY(850%); } }
        @keyframes adminContentEnter { from { opacity:0; transform:translateY(14px) scale(.992); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes adminHalo { 0% { opacity:.6; transform:scale(.96); } 80%,100% { opacity:0; transform:scale(1.3); } }
        @keyframes adminSpark { 0%,100% { transform:rotate(0) scale(1); opacity:.8; } 50% { transform:rotate(18deg) scale(1.17); opacity:1; } }
        @keyframes adminButtonShimmer { 0%,60%,100% { left:-60%; } 25% { left:130%; } }
        @media (max-width: 1100px) {
          .admin-float-card { opacity:.72; scale:.88; }
          .admin-float-card-left { left:1rem; }
          .admin-float-card-right { right:1rem; }
          .admin-glyph-bag { left:7%; }
          .admin-glyph-package { right:7%; }
        }
        @media (max-width: 760px) {
          .admin-float-card { display:none; }
          .admin-glyph-bag { left:5%; top:8%; scale:.78; }
          .admin-glyph-package { right:4%; bottom:8%; scale:.78; }
          .admin-glyph-pin { right:5%; top:15%; scale:.72; }
          .admin-glyph-spark { left:6%; bottom:13%; scale:.72; }
          .admin-network { opacity:.36; }
          .admin-orbit-one { width:130vw; height:100vw; }
          .admin-orbit-two { width:112vw; height:85vw; }
          .admin-orbit-three { width:95vw; height:72vw; }
          .admin-grid { background-size:38px 38px; opacity:.24; }
        }
        @media (prefers-reduced-motion: reduce) {
          .admin-login-root *, .admin-login-root *::before, .admin-login-root *::after {
            animation-duration:.01ms !important;
            animation-iteration-count:1 !important;
            scroll-behavior:auto !important;
            transition-duration:.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
