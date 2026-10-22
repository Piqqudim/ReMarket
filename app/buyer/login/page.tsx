"use client";

import {
  useState,
  type FormEvent,
} from "react";

import {
  getSession,
  signIn,
  signOut,
} from "next-auth/react";

import { useRouter } from "next/navigation";
import Link from "next/link";

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
  Package,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Truck,
} from "lucide-react";

/**
 * Ambient marketplace animation for the seller sign-up screen.
 * Purely decorative: it does not intercept input or affect page layout.
 */
function MarketBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="market-backdrop pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
      >
        {/* Warm, oversized colour fields */}
        <div className="market-blob market-blob-one" />
        <div className="market-blob market-blob-two" />
        <div className="market-glow market-glow-one" />
        <div className="market-glow market-glow-two" />

        {/* Quiet dotted details */}
        <div className="market-dot-grid market-dot-grid-top" />
        <div className="market-dot-grid market-dot-grid-bottom" />

        {/* A soft route connecting local shops and shoppers */}
        <svg
          className="market-route market-route-one"
          viewBox="0 0 720 420"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M30 330C118 330 106 236 210 236C308 236 302 108 404 108C506 108 502 190 690 190"
            stroke="#F5A078"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="5 12"
          />
          <circle cx="30" cy="330" r="5" fill="#FF7A55" />
          <circle cx="210" cy="236" r="5" fill="#FFB18D" />
          <circle cx="404" cy="108" r="5" fill="#FF7A55" />
          <circle cx="690" cy="190" r="5" fill="#FFB18D" />
          <circle className="market-route-pulse" cx="404" cy="108" r="12" stroke="#FF7A55" strokeOpacity=".55" strokeWidth="2" />
        </svg>

        {/* Floating product cards: deliberately placed at the outer edges */}
        <div className="market-float market-product-card market-card-left">
          <div className="market-product-art market-art-coral">
            <ShoppingBag className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <div className="market-card-copy">
            <span className="market-eyebrow">LOCAL FINDS</span>
            <span className="market-line market-line-long" />
            <span className="market-line market-line-short" />
            <span className="market-price">Near you <span>↗</span></span>
          </div>
          <Sparkles className="market-card-sparkle h-4 w-4" />
        </div>

        <div className="market-float market-product-card market-card-right">
          <div className="market-product-art market-art-gold">
            <Package className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <div className="market-card-copy">
            <span className="market-eyebrow">FRESH PICKS</span>
            <span className="market-line market-line-long" />
            <span className="market-line market-line-short" />
            <span className="market-price">Discover <span>✦</span></span>
          </div>
          <span className="market-mini-badge"><CheckMark /></span>
        </div>

        {/* Small market symbols drifting around the outer canvas */}
        <div className="market-icon-orb market-orb-bag">
          <ShoppingCart className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="market-icon-orb market-orb-store">
          <Store className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="market-icon-orb market-orb-tag">
          <Tag className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="market-icon-orb market-orb-pin">
          <MapPin className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="market-delivery-chip">
          <Truck className="h-4 w-4" />
          <span>Good finds, close by</span>
        </div>

        {/* A little marketplace awning motif */}
        <div className="market-awning" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <div className="market-awning-base"><Store className="h-5 w-5" /></div>
        </div>
      </div>

      <style jsx>{`
        .market-backdrop {
          isolation: isolate;
          background:
            radial-gradient(ellipse at 50% 35%, rgba(255, 255, 255, .55), transparent 42%),
            linear-gradient(135deg, #fff0dc 0%, #fff7ee 48%, #ffeddc 100%);
        }

        .market-blob,
        .market-glow {
          position: absolute;
          border-radius: 9999px;
          pointer-events: none;
          will-change: transform;
        }

        .market-blob-one {
          width: clamp(250px, 38vw, 520px);
          height: clamp(250px, 38vw, 520px);
          left: -9%;
          top: -17%;
          opacity: .8;
          background: linear-gradient(145deg, #ffab7d 2%, #ff8b68 50%, #ffd0a5 100%);
          border-radius: 42% 58% 63% 37% / 39% 39% 61% 61%;
          animation: marketBlobFloat 18s ease-in-out infinite alternate;
        }

        .market-blob-two {
          width: clamp(300px, 42vw, 560px);
          height: clamp(250px, 34vw, 450px);
          right: -12%;
          bottom: -19%;
          opacity: .72;
          background: linear-gradient(145deg, #ffc28e 0%, #ff9472 54%, #ffd8b3 100%);
          border-radius: 64% 36% 34% 66% / 53% 42% 58% 47%;
          animation: marketBlobFloat 22s ease-in-out infinite alternate-reverse;
        }

        .market-glow-one {
          width: 320px;
          height: 320px;
          left: 5%;
          top: 36%;
          background: rgba(255, 255, 255, .47);
          filter: blur(30px);
          animation: marketGlow 11s ease-in-out infinite alternate;
        }

        .market-glow-two {
          width: 360px;
          height: 360px;
          right: 3%;
          top: 14%;
          background: rgba(255, 213, 174, .48);
          filter: blur(36px);
          animation: marketGlow 13s ease-in-out infinite alternate-reverse;
        }

        .market-dot-grid {
          position: absolute;
          width: 112px;
          height: 112px;
          opacity: .45;
          background-image: radial-gradient(#e9895f 1.5px, transparent 1.5px);
          background-size: 14px 14px;
          animation: marketDots 24s linear infinite;
        }

        .market-dot-grid-top { right: 7%; top: 10%; }
        .market-dot-grid-bottom { left: 7%; bottom: 9%; animation-direction: reverse; }

        .market-route {
          position: absolute;
          width: min(68vw, 720px);
          height: auto;
          left: 50%;
          top: 50%;
          opacity: .47;
          transform: translate(-50%, -50%);
          overflow: visible;
        }

        .market-route path { animation: marketRouteDash 18s linear infinite; }
        .market-route-pulse { transform-box: fill-box; transform-origin: center; animation: marketPulse 3s ease-out infinite; }

        .market-float { position: absolute; will-change: transform; }
        .market-product-card {
          display: flex;
          align-items: center;
          gap: 13px;
          width: 214px;
          min-height: 96px;
          padding: 13px;
          border: 1px solid rgba(255, 255, 255, .86);
          border-radius: 21px;
          background: rgba(255, 255, 255, .79);
          box-shadow: 0 18px 48px rgba(112, 66, 36, .10), inset 0 1px 0 rgba(255,255,255,.9);
          backdrop-filter: blur(12px);
        }

        .market-card-left { left: max(2.8%, calc((100vw - 1440px) / 2)); top: 40%; animation: marketFloatLeft 8s ease-in-out infinite; }
        .market-card-right { right: max(3%, calc((100vw - 1440px) / 2)); top: 58%; animation: marketFloatRight 9s ease-in-out infinite; }

        .market-product-art {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 58px;
          height: 64px;
          flex: 0 0 auto;
          border-radius: 16px;
        }
        .market-art-coral { color: #a93620; background: linear-gradient(145deg, #ffe4d8, #ffbba1); }
        .market-art-gold { color: #8d6422; background: linear-gradient(145deg, #fff0c8, #ffdca3); }
        .market-card-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: flex-start; }
        .market-eyebrow { margin-bottom: 8px; color: #9b6953; font-size: 8px; font-weight: 900; letter-spacing: .13em; white-space: nowrap; }
        .market-line { display: block; height: 5px; border-radius: 999px; background: #e8e1db; }
        .market-line-long { width: 71px; }
        .market-line-short { width: 46px; margin-top: 5px; opacity: .65; }
        .market-price { display: flex; width: 100%; align-items: center; justify-content: space-between; margin-top: 10px; color: #a43b24; font-size: 9px; font-weight: 850; }
        .market-price span { font-size: 13px; color: #ff6848; }
        .market-card-sparkle { position: absolute; right: 12px; top: 10px; color: #ff805d; animation: marketTwinkle 2.7s ease-in-out infinite; }
        .market-mini-badge { position: absolute; right: -7px; top: -7px; display: grid; width: 25px; height: 25px; place-items: center; border: 3px solid #fffaf5; border-radius: 50%; background: #43b581; color: white; }

        .market-icon-orb {
          position: absolute;
          display: grid;
          width: 47px;
          height: 47px;
          place-items: center;
          border: 1px solid rgba(255,255,255,.9);
          border-radius: 16px;
          color: #a64a2e;
          background: rgba(255,255,255,.71);
          box-shadow: 0 12px 30px rgba(112,66,36,.08);
          backdrop-filter: blur(8px);
        }
        .market-orb-bag { left: 11%; top: 20%; animation: marketBob 6s ease-in-out infinite; }
        .market-orb-store { right: 11%; top: 30%; animation: marketBob 7s ease-in-out infinite reverse; }
        .market-orb-tag { left: 19%; bottom: 21%; color: #95651f; animation: marketBob 8s ease-in-out infinite; }
        .market-orb-pin { right: 17%; bottom: 16%; color: #ba4e34; animation: marketBob 6.5s ease-in-out infinite reverse; }

        .market-delivery-chip {
          position: absolute;
          display: flex;
          align-items: center;
          gap: 8px;
          right: 8%;
          top: 17%;
          padding: 10px 13px;
          border: 1px solid rgba(255,255,255,.9);
          border-radius: 999px;
          color: #8d4d34;
          background: rgba(255,255,255,.72);
          box-shadow: 0 12px 30px rgba(112,66,36,.07);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .01em;
          animation: marketBob 7.5s ease-in-out infinite;
        }

        .market-awning {
          position: absolute;
          left: 8%;
          bottom: 18%;
          display: flex;
          width: 68px;
          height: 27px;
          filter: drop-shadow(0 8px 10px rgba(150, 76, 42, .12));
          transform: rotate(-8deg);
          animation: marketAwning 8s ease-in-out infinite;
        }
        .market-awning > span { flex: 1; height: 18px; background: #ff694a; border-radius: 8px 8px 4px 4px; }
        .market-awning > span:nth-child(even) { background: #fff8ee; }
        .market-awning-base { position: absolute; left: 4px; right: 4px; bottom: -15px; display: grid; height: 22px; place-items: center; border: 1px solid #f0c8b4; border-radius: 4px; background: rgba(255,255,255,.88); color: #b84b2f; }

        @keyframes marketBlobFloat {
          from { transform: translate3d(0, 0, 0) rotate(-4deg) scale(1); }
          to { transform: translate3d(24px, 18px, 0) rotate(5deg) scale(1.04); }
        }
        @keyframes marketGlow {
          from { transform: translate3d(-8px, 10px, 0) scale(.92); opacity: .5; }
          to { transform: translate3d(18px, -12px, 0) scale(1.12); opacity: .9; }
        }
        @keyframes marketDots {
          from { background-position: 0 0; transform: translateY(0); }
          to { background-position: 42px 28px; transform: translateY(-8px); }
        }
        @keyframes marketRouteDash { to { stroke-dashoffset: -170; } }
        @keyframes marketPulse { 0% { transform: scale(.6); opacity: .9; } 80%, 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes marketFloatLeft { 0%, 100% { transform: translate3d(0, 0, 0) rotate(-2deg); } 50% { transform: translate3d(0, -15px, 0) rotate(1deg); } }
        @keyframes marketFloatRight { 0%, 100% { transform: translate3d(0, 0, 0) rotate(2deg); } 50% { transform: translate3d(0, 13px, 0) rotate(-1deg); } }
        @keyframes marketBob { 0%, 100% { transform: translate3d(0, 0, 0) rotate(0); } 50% { transform: translate3d(0, -10px, 0) rotate(3deg); } }
        @keyframes marketTwinkle { 0%, 100% { opacity: .45; transform: rotate(0) scale(.86); } 50% { opacity: 1; transform: rotate(24deg) scale(1.12); } }
        @keyframes marketAwning { 0%, 100% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(-8px) rotate(-4deg); } }

        @media (max-width: 1100px) {
          .market-card-left { left: -14px; top: 28%; transform: scale(.8); opacity: .34; }
          .market-card-right { right: -24px; top: 69%; transform: scale(.8); opacity: .34; }
          .market-orb-bag { left: 3%; top: 18%; }
          .market-orb-store { right: 4%; top: 25%; }
          .market-orb-tag { left: 5%; bottom: 10%; }
          .market-orb-pin { right: 6%; bottom: 8%; }
          .market-delivery-chip { right: 4%; top: 11%; opacity: .7; }
          .market-awning { left: 4%; bottom: 9%; }
          .market-route { width: 95vw; opacity: .25; }
        }

        @media (max-width: 640px) {
          .market-blob-one { width: 250px; height: 250px; left: -125px; top: -85px; opacity: .52; }
          .market-blob-two { width: 290px; height: 250px; right: -165px; bottom: -65px; opacity: .52; }
          .market-glow-one { width: 210px; height: 210px; left: -100px; top: 40%; }
          .market-glow-two { width: 230px; height: 230px; right: -115px; top: 18%; }
          .market-dot-grid { width: 68px; height: 68px; background-size: 11px 11px; opacity: .3; }
          .market-dot-grid-top { right: 3%; top: 4%; }
          .market-dot-grid-bottom { left: 3%; bottom: 4%; }
          .market-card-left, .market-card-right { display: none; }
          .market-icon-orb { width: 37px; height: 37px; border-radius: 13px; opacity: .45; }
          .market-icon-orb :global(svg) { width: 17px; height: 17px; }
          .market-orb-bag { left: 4%; top: 19%; }
          .market-orb-store { right: 4%; top: 29%; }
          .market-orb-tag { left: 4%; bottom: 10%; }
          .market-orb-pin { right: 4%; bottom: 7%; }
          .market-delivery-chip { right: 3%; top: 7%; gap: 5px; padding: 7px 9px; font-size: 8px; opacity: .65; }
          .market-delivery-chip :global(svg) { width: 13px; height: 13px; }
          .market-awning { left: 4%; bottom: 6%; transform: scale(.76) rotate(-8deg); opacity: .55; }
          .market-route { width: 130vw; top: 45%; opacity: .16; }
        }

        @media (prefers-reduced-motion: reduce) {
          .market-backdrop *, .market-backdrop *::before, .market-backdrop *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="m3.2 8.2 3.1 3.1 6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


export default function BuyerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const trimmedEmail = email.trim();

    setError("");

    if (!trimmedEmail) {
      setError("Email address is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    /*
     * If credentials are accepted but the session
     * cannot be confirmed as a BUYER session, sign
     * out rather than leaving another role logged in
     * through this buyer-specific login page.
     */
    let cleanupRequired = false;

    try {
      const result = await signIn("credentials", {
        email: trimmedEmail,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (
        !result ||
        result.error ||
        result.ok !== true
      ) {
        setError("Invalid email or password.");
        return;
      }

      cleanupRequired = true;

      const session = await getSession();

      /*
       * This page is specifically for buyers.
       * ADMIN and SELLER accounts must use their
       * appropriate login flows.
       *
       * The server must still enforce role-based
       * access independently of this client check.
       */
      if (
        !session?.user ||
        session.user.role !== "BUYER"
      ) {
        await signOut({
          redirect: false,
        });

        cleanupRequired = false;

        setError(
          "Unable to sign in with this account on the buyer login page."
        );

        return;
      }

      cleanupRequired = false;

      router.replace("/");
      router.refresh();
    } catch (loginError) {
      console.error(
        "Buyer login error:",
        loginError
      );

      /*
       * Fail closed if authentication succeeded
       * but session verification failed.
       */
      if (cleanupRequired) {
        try {
          await signOut({
            redirect: false,
          });
        } catch (signOutError) {
          console.error(
            "Unable to clear unverified login session:",
            signOutError
          );
        }
      }

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearError() {
    if (error) {
      setError("");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FFF0DC] px-4 py-8 sm:px-6 sm:py-10">
      {/* Animated marketplace backdrop — decorative and non-interactive */}
      <MarketBackdrop />

      {/* MAIN CONTENT */}

      <section className="relative z-[15] flex w-full max-w-[655px] flex-col items-center">
        {/* BRAND */}

        <div className="mb-7 flex flex-col items-center text-center sm:mb-10">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#FF563F] shadow-[0_12px_30px_rgba(255,86,63,0.25)] sm:h-28 sm:w-28 sm:rounded-[26px]">
            <Store
              className="h-11 w-11 text-white sm:h-16 sm:w-16"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </div>

          <h1 className="text-[38px] font-semibold leading-none tracking-[-2px] text-[#111C27] sm:text-[52px]">
            Re
            <span className="text-[#FF563F]">
              Market
            </span>
          </h1>

          <p className="mt-3 text-base font-normal text-[#718096] sm:mt-4 sm:text-[22px]">
            Buyer Account
          </p>
        </div>

        {/* LOGIN CARD */}

        <div className="w-full min-w-0 rounded-[24px] bg-white px-5 py-7 shadow-[0_20px_60px_rgba(80,50,20,0.10)] sm:rounded-[28px] sm:px-14 sm:py-12">
          {/* CARD HEADING */}

          <div className="mb-7 sm:mb-9">
            <h2 className="text-[26px] font-semibold leading-tight text-[#111C27] sm:text-[32px]">
              Welcome back
            </h2>

            <p className="mt-3 text-base text-[#718096] sm:text-[19px]">
              Sign in to leave ratings and reviews
            </p>
          </div>

          {/* LOGIN FORM */}

          <form
            onSubmit={submit}
            aria-busy={loading}
            className="space-y-6 sm:space-y-7"
          >
            {/* EMAIL */}

            <div>
              <label
                htmlFor="email"
                className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]"
              >
                Email address
              </label>

              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F] sm:left-5"
                  strokeWidth={2}
                />

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearError();
                  }}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-[58px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-12 pr-4 text-base text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7] sm:h-[64px] sm:pl-14 sm:pr-5 sm:text-[17px]"
                />
              </div>
            </div>

            {/* PASSWORD */}

            <div>
              <label
                htmlFor="password"
                className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]"
              >
                Password
              </label>

              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F] sm:left-5"
                  strokeWidth={2}
                />

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearError();
                  }}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-[58px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-12 pr-12 text-base text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7] sm:h-[64px] sm:pl-14 sm:pr-14 sm:text-[17px]"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  aria-pressed={showPassword}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#718096] transition-colors hover:text-[#111C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF694F] disabled:cursor-not-allowed disabled:opacity-50 sm:right-5"
                >
                  {showPassword ? (
                    <EyeOff
                      aria-hidden="true"
                      className="h-5 w-5"
                      strokeWidth={2}
                    />
                  ) : (
                    <Eye
                      aria-hidden="true"
                      className="h-5 w-5"
                      strokeWidth={2}
                    />
                  )}
                </button>
              </div>
            </div>

            {/* LOGIN ERROR */}

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-3 rounded-[14px] border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4 sm:gap-4 sm:px-5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EF3F3F] text-white">
                  <CircleAlert
                    aria-hidden="true"
                    className="h-4 w-4"
                    strokeWidth={2.3}
                  />
                </div>

                <p className="min-w-0 flex-1 break-words pt-1 text-sm text-[#E33B22] sm:text-base">
                  {error}
                </p>
              </div>
            )}

            {/* LOGIN BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[60px] w-full items-center justify-center gap-3 rounded-[14px] bg-[#FF563F] px-4 py-3 text-base font-semibold text-white shadow-[0_10px_25px_rgba(255,86,63,0.22)] transition-all hover:bg-[#F44D37] hover:shadow-[0_14px_30px_rgba(255,86,63,0.28)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF694F]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[66px] sm:text-[19px]"
            >
              {loading ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="h-6 w-6 animate-spin"
                    strokeWidth={2}
                  />

                  Signing in...
                </>
              ) : (
                <>
                  Log in

                  <ArrowRight
                    aria-hidden="true"
                    className="h-6 w-6"
                    strokeWidth={2}
                  />
                </>
              )}
            </button>
          </form>

          {/* BUYER SIGNUP */}

          <div className="mt-7 text-center sm:mt-8">
            <p className="text-sm text-[#718096] sm:text-[15px]">
              Don&apos;t have a buyer account?{" "}

              <Link
                href="/buyer/signup"
                className="font-semibold text-[#FF563F] transition-colors hover:text-[#F44D37] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF694F]"
              >
                Create one
              </Link>
            </p>
          </div>

          {/* FOOTER */}

          <div className="mt-8 flex items-center gap-3 sm:mt-10 sm:gap-5">
            <div className="h-px min-w-0 flex-1 bg-[#D9DEE5]" />

            <p className="text-center text-[11px] text-[#718096] sm:whitespace-nowrap sm:text-[15px]">
              Powered by your local marketplace
            </p>

            <div className="h-px min-w-0 flex-1 bg-[#D9DEE5]" />
          </div>
        </div>
      </section>
    </main>
  );
}
