import { NextResponse } from "next/server";

import {
  LAGOS_AREA_GROUPS,
  PREDEFINED_LAGOS_AREAS,
} from "@/lib/lagos-areas";

/**
 * The area picker is built from static, public application data.
 * Revalidate the route periodically rather than disabling all caching.
 */
export const revalidate = 3600;

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET() {
  return NextResponse.json(
    {
      areas: PREDEFINED_LAGOS_AREAS,
      groups: LAGOS_AREA_GROUPS,
    },
    {
      headers: {
        "Cache-Control": CACHE_CONTROL,
      },
    }
  );
}