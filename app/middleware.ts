import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

function isAdminPage(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    (pathname.startsWith("/admin/") &&
      !pathname.startsWith("/admin/login"))
  );
}

function isAdminApi(pathname: string): boolean {
  return (
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

function getLoginUrl(request: NextRequest): URL {
  const loginUrl = new URL(
    "/admin/login",
    request.url
  );

  const callbackPath =
    request.nextUrl.pathname +
    request.nextUrl.search;

  loginUrl.searchParams.set(
    "callbackUrl",
    callbackPath
  );

  return loginUrl;
}

export async function middleware(
  request: NextRequest
) {
  const { pathname } = request.nextUrl;

  const adminPage =
    isAdminPage(pathname);

  const adminApi =
    isAdminApi(pathname);

  /*
   * The matcher should already restrict this
   * middleware to admin routes, but keeping this
   * guard makes the middleware safe if that
   * configuration is changed later.
   */
  if (!adminPage && !adminApi) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
  });

  /*
   * ------------------------------------------------
   * AUTHENTICATION
   * ------------------------------------------------
   */

  if (!token?.id) {
    if (adminApi) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    return NextResponse.redirect(
      getLoginUrl(request)
    );
  }

  /*
   * ------------------------------------------------
   * ADMIN ROLE
   * ------------------------------------------------
   *
   * This is an early middleware gate.
   *
   * The actual protected API routes still use
   * requireAdmin(), which performs the authoritative
   * database-backed role check.
   */

  if (token.role !== "ADMIN") {
    if (adminApi) {
      return NextResponse.json(
        {
          error: "Forbidden",
        },
        {
          status: 403,
        }
      );
    }

    return NextResponse.redirect(
      new URL("/", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/((?!login(?:/|$)).*)",
    "/api/admin/:path*",
  ],
};