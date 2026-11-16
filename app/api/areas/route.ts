
import { NextResponse } from "next/server";

import {
  LAGOS_AREA_GROUPS,
  EDO_AREA_GROUPS,
  NIGERIA_LOCATION_GROUPS,
  PREDEFINED_STATES,
  PREDEFINED_LAGOS_LGAS,
  PREDEFINED_EDO_LGAS,
  PREDEFINED_LAGOS_AREAS,
  PREDEFINED_EDO_AREAS,
  PREDEFINED_AREAS,
} from "@/lib/lagos-areas";

/**
 * Location data is static public application data.
 * Revalidate periodically instead of disabling caching.
 */
export const revalidate = 3600;

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET() {
  return NextResponse.json(
    {
      /**
       * New state-aware location structure.
       * Use this for new product and search filters.
       */
      states: PREDEFINED_STATES,

      stateGroups: NIGERIA_LOCATION_GROUPS,

      lgasByState: {
        Lagos: PREDEFINED_LAGOS_LGAS,
        Edo: PREDEFINED_EDO_LGAS,
      },

      areasByState: {
        Lagos: PREDEFINED_LAGOS_AREAS,
        Edo: PREDEFINED_EDO_AREAS,
      },

      /**
       * Flat list of all predefined areas.
       * Prefer areasByState or stateGroups when filtering
       * so areas from different states are not mixed.
       */
      allAreas: PREDEFINED_AREAS,

      /**
       * Backward compatibility for existing Lagos-only components.
       * Keep these until the old consumers have been updated.
       */
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
