"use client";

import {
  MapPin,
  Package,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Truck,
} from "lucide-react";

/**
 * Ambient marketplace animation for the seller sign-up screen.
 * Purely decorative: it does not intercept input or affect page layout.
 */
export default function MarketSignupBackdrop() {
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
