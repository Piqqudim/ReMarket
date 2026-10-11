import { NextResponse } from "next/server";

import { LAGOS_AREA_GROUPS, PREDEFINED_LAGOS_AREAS } from "@/lib/lagos-areas";

export async function GET() {
  return NextResponse.json(
    {
      areas: PREDEFINED_LAGOS_AREAS,
      groups: LAGOS_AREA_GROUPS,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}