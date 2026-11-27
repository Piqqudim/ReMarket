"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CalendarClock,
  CreditCard,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  Package,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Trash2,
  Truck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ label: string; href: string; icon: LucideIcon }>;
}> = [
  {
    label: "Workspace",
    items: [{ label: "Overview", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Marketplace",
    items: [
      { label: "Businesses", href: "/admin/businesses", icon: Store },
      { label: "Sellers", href: "/admin/sellers", icon: UserRound },
      { label: "Buyers", href: "/admin/buyers", icon: Users },
      { label: "Products", href: "/admin/products", icon: Package },
      { label: "Categories", href: "/admin/categories", icon: Tags },
      { label: "Orders", href: "/admin/orders", icon: ShoppingCart },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments", href: "/admin/payments", icon: CreditCard },
      { label: "Settlements", href: "/admin/settlements", icon: Wallet },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Delivery", href: "/admin/delivery", icon: Truck },
      { label: "Buyer requests", href: "/admin/requests", icon: ClipboardList },
      { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { label: "Content", href: "/admin/content", icon: FileText },
    ],
  },
  {
    label: "Governance & records",
    items: [
      { label: "Audit logs", href: "/admin/audit-logs", icon: ShieldCheck },
      { label: "Deletion requests", href: "/admin/business-deletion-requests", icon: Trash2 },
      { label: "Claim records", href: "/admin/claims", icon: Store },
      { label: "Legacy booking records", href: "/admin/bookings", icon: CalendarClock },
    ],
  },
];

type AdminWorkspaceShellProps = { children: ReactNode };

function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin workspace navigation" className="min-w-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {NAV_GROUPS.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="mb-2 px-3 text-xs font-bold uppercase tracking-[0.09em] text-[#8B8178]">
            {group.label}
          </h2>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${
                    active
                      ? "bg-[#FFF0E9] text-[#9F2D18]"
                      : "text-[#514840] hover:bg-[#F7F3EE] hover:text-[#9F2D18]"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {active && <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#9F2D18] text-lg font-extrabold text-white shadow-sm">R</span>
      <span className="min-w-0">
        <span className="block truncate text-base font-extrabold tracking-tight text-[#2E241F]">ReMarket</span>
        <span className="block text-sm font-medium text-[#756B61]">Administration</span>
      </span>
    </Link>
  );
}

export default function AdminWorkspaceShell({ children }: AdminWorkspaceShellProps) {
  const pathname = usePathname() || "/admin";
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const drawer = mobileDrawerRef.current;
    const getFocusableElements = () => Array.from(
      drawer?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

    getFocusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        drawer?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else mobileMenuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  // The login page intentionally stays outside the authenticated workspace shell.
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="rm-admin-scope min-h-dvh bg-[#FCFAF6] text-[#2E241F]">
      <a
        href="#rm-admin-main-content"
        className="sr-only z-[100] rounded-lg bg-white px-4 py-3 font-semibold text-[#9F2D18] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-[#FF5A36]"
      >
        Skip to main content
      </a>
      <div className="flex min-h-dvh w-full">
        <aside className="rm-admin-workspace-sidebar sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-[#EAE6DF] bg-white lg:flex">
          <div className="border-b border-[#EAE6DF] px-5 py-5">
            <Brand />
          </div>
          <Navigation pathname={pathname} />
          <div className="border-t border-[#EAE6DF] p-3">
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/admin/login" })}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF0E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-[#EAE6DF] bg-white/95 px-4 backdrop-blur lg:hidden">
            <Brand />
            <button
              type="button"
              aria-label={mobileOpen ? "Close admin navigation" : "Open admin navigation"}
              aria-expanded={mobileOpen}
              aria-controls="rm-admin-mobile-navigation"
              ref={mobileMenuButtonRef}
              onClick={() => setMobileOpen((current) => !current)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white text-[#514840] transition hover:bg-[#FFF0E9] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </header>

          <div id="rm-admin-main-content" tabIndex={-1} className="rm-admin-content min-w-0 flex-1 outline-none">{children}</div>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 cursor-default bg-[#17202A]/45"
          />
          <aside
            id="rm-admin-mobile-navigation"
            ref={mobileDrawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation drawer"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,340px)] max-w-full flex-col border-r border-[#EAE6DF] bg-white shadow-2xl"
          >
            <div className="flex min-h-16 items-center justify-between border-b border-[#EAE6DF] px-4 py-3">
              <Brand />
              <button
                type="button"
                aria-label="Close admin navigation"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#514840] hover:bg-[#F7F3EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Navigation pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-[#EAE6DF] p-3">
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/admin/login" })}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF0E9]"
              >
                <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
