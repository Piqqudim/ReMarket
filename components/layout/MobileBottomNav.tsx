"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSession } from "next-auth/react";

import {
  Home,
  ShoppingBag,
  UserCircle,
  Wrench,
} from "lucide-react";

type AccountRole = "ADMIN" | "BUYER" | "SELLER";

function parseAccountRole(value: unknown): AccountRole | null {
  if (
    value === "ADMIN" ||
    value === "BUYER" ||
    value === "SELLER"
  ) {
    return value;
  }

  return null;
}

/*
 * The public mobile navigation should not appear
 * inside the separate seller/admin workspaces
 * or authentication screens.
 */
function shouldHidePublicNavigation(pathname: string): boolean {
  const hiddenPrefixes = [
    "/admin",
    "/seller",
    "/buyer/login",
    "/buyer/signup",
    "/seller/login",
    "/seller/signup",
  ];

  return hiddenPrefixes.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`),
  );
}

/*
 * Determine when Account should appear active.
 *
 * Messages and Notifications have their own
 * header shortcuts, so they do not activate
 * the Account tab.
 */
function isAccountPath(pathname: string): boolean {
  const accountPrefixes = [
    "/profile",
    "/saved",
    "/bookings",
    "/account",
  ];

  return accountPrefixes.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`),
  );
}

export default function MobileBottomNav() {
  const pathname = usePathname();

  const [accountRole, setAccountRole] =
    useState<AccountRole | null>(null);

  const [isAuthenticated, setIsAuthenticated] =
    useState(false);

  const [sessionLoading, setSessionLoading] =
    useState(true);

  const requestVersionRef = useRef(0);

  /*
   * =========================================
   * LOAD ACCOUNT SESSION
   * =========================================
   *
   * Refresh the session on initial load,
   * route changes and browser focus.
   */

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      const requestVersion =
        ++requestVersionRef.current;

      try {
        const session = await getSession();

        if (
          cancelled ||
          requestVersion !== requestVersionRef.current
        ) {
          return;
        }

        const rawUser = session?.user as
          | {
              role?: unknown;
            }
          | undefined;

        if (!rawUser) {
          setIsAuthenticated(false);
          setAccountRole(null);
          return;
        }

        setIsAuthenticated(true);
        setAccountRole(
          parseAccountRole(rawUser.role),
        );
      } catch (error) {
        console.error(
          "Mobile navigation session error:",
          error,
        );

        if (!cancelled) {
          setIsAuthenticated(false);
          setAccountRole(null);
        }
      } finally {
        if (
          !cancelled &&
          requestVersion === requestVersionRef.current
        ) {
          setSessionLoading(false);
        }
      }
    }

    function handleWindowFocus() {
      void loadAccount();
    }

    void loadAccount();

    window.addEventListener(
      "focus",
      handleWindowFocus,
    );

    return () => {
      cancelled = true;

      requestVersionRef.current += 1;

      window.removeEventListener(
        "focus",
        handleWindowFocus,
      );
    };
  }, [pathname]);

  /*
   * =========================================
   * ROUTE VISIBILITY
   * =========================================
   */

  if (shouldHidePublicNavigation(pathname)) {
    return null;
  }

  /*
   * =========================================
   * ACTIVE NAVIGATION
   * =========================================
   */

  const homeActive = pathname === "/";

  const productsActive =
    pathname === "/shop" ||
    pathname.startsWith("/shop/") ||
    pathname.startsWith("/product/");

  const servicesActive =
    pathname === "/services" ||
    pathname.startsWith("/services/");

  const accountActive =
    isAccountPath(pathname);

  /*
   * =========================================
   * ACCOUNT DESTINATION
   * =========================================
   */

  const accountHref = !isAuthenticated
    ? "/buyer/login"
    : accountRole === "ADMIN"
      ? "/admin"
      : accountRole === "SELLER"
        ? "/seller"
        : "/profile";

  /*
   * =========================================
   * NAVIGATION ITEMS
   * =========================================
   */

  const items = [
    {
      label: "Home",
      href: "/",
      active: homeActive,
      icon: Home,
    },
    {
      label: "Products",
      href: "/shop",
      active: productsActive,
      icon: ShoppingBag,
    },
    {
      label: "Services",
      href: "/services",
      active: servicesActive,
      icon: Wrench,
    },
    {
      label: "Account",
      href: accountHref,
      active: accountActive,
      icon: UserCircle,
    },
  ];

  /*
   * =========================================
   * RENDER
   * =========================================
   */

  return (
    <nav
      aria-label="Mobile navigation"
      className="
        fixed inset-x-0 bottom-0 z-50
        border-t border-[#EAE6DF]
        bg-white/95 px-2 pt-2
        shadow-[0_-4px_18px_rgba(23,32,42,0.04)]
        backdrop-blur
        lg:hidden
      "
      style={{
        paddingBottom:
          "max(8px, env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="
          mx-auto grid w-full max-w-[600px]
          grid-cols-4
        "
      >
        {items.map((item) => {
          const Icon = item.icon;

          const isAccountItem =
            item.label === "Account";

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={
                item.active ? "page" : undefined
              }
              aria-disabled={
                isAccountItem && sessionLoading
                  ? undefined
                  : undefined
              }
              className={`
                flex min-h-[54px]
                flex-col items-center justify-center
                gap-1 rounded-xl px-1
                transition-colors
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-inset
                focus-visible:ring-[#FF5A36]
                ${
                  item.active
                    ? "text-[#FF5A36]"
                    : "text-[#756B61] hover:bg-[#FFF7F4] hover:text-[#9F2D18]"
                }
              `}
            >
              <Icon
                className="h-5 w-5"
                strokeWidth={
                  item.active ? 2.5 : 2
                }
                aria-hidden="true"
              />

              <span
                className={`
                  text-[10px]
                  ${
                    item.active
                      ? "font-bold"
                      : "font-semibold"
                  }
                `}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}