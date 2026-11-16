
/**
 * ReMarket Nigerian location vocabulary.
 *
 * Architecture:
 *
 * Country
 *   └── State
 *       └── Local Government Area (LGA)
 *           └── Area / Town / Neighbourhood
 *
 * Currently supported:
 * - Lagos State: 20 LGAs
 * - Edo State: 18 LGAs
 *
 * Lagos exports are preserved for backward compatibility.
 */

/* =========================================================
   TYPES
========================================================= */

export type AreaLgaGroup = {
  lga: string;
  areas: readonly string[];
  aliases?: readonly string[];
};

export type StateAreaGroup = {
  state: string;
  lgas: readonly AreaLgaGroup[];
};

export type LocationSuggestion = {
  state: string;
  lga: string;
  area: string;
  level: "LGA" | "AREA";
  label: string;
};

export type LocationSuggestionOptions = {
  state?: string;
  lga?: string;
  query?: string;
  limit?: number;
};

/* =========================================================
   LAGOS STATE — 20 LGAs
========================================================= */

export const LAGOS_AREA_GROUPS = [
  {
    lga: "Agege",
    areas: [
      "Agege",
      "Orile Agege",
      "Dopemu",
      "Oko-Oba",
      "Isale Odo",
      "Keke",
    ],
  },
  {
    lga: "Ajeromi-Ifelodun",
    areas: [
      "Ajegunle",
      "Tolu",
      "Olodi",
      "Alaba Oro",
      "Awodi-Ora",
      "Layeni",
      "Mosafejo",
    ],
  },
  {
    lga: "Alimosho",
    areas: [
      "Alimosho",
      "Egbeda",
      "Akowonjo",
      "Shasha",
      "Idimu",
      "Egbe",
      "Ikotun",
      "Ijegun",
      "Igando",
      "Iyana-Ipaja",
      "Ayobo",
      "Abule Egba",
      "Aboru",
      "Meiran",
      "Oke-Odo",
      "Pleasure",
    ],
  },
  {
    lga: "Amuwo-Odofin",
    areas: [
      "Amuwo",
      "Festac",
      "Mile 2",
      "Satellite Town",
      "Kirikiri",
      "Irede",
      "Ibeshe",
    ],
  },
  {
    lga: "Apapa",
    areas: [
      "Apapa",
      "Apapa Wharf",
      "Iganmu",
      "Ijora",
      "Liverpool",
      "Tin Can",
    ],
  },
  {
    lga: "Badagry",
    areas: [
      "Badagry",
      "Badagry West",
      "Olorunda",
      "Oko-Afo",
    ],
  },
  {
    lga: "Epe",
    areas: [
      "Epe",
      "Eredo",
      "Ikosi-Ejinrin",
    ],
  },
  {
    lga: "Eti-Osa",
    areas: [
      "Ikoyi",
      "Obalende",
      "Victoria Island",
      "Oniru",
      "Lekki Phase 1",
      "Ikate",
      "Jakande",
      "Osapa London",
      "Agungi",
      "Igbo-Efon",
      "Idado",
      "Chevron",
      "Ikota",
      "VGC",
      "Ajah",
      "Badore",
      "Sangotedo",
    ],
  },
  {
    lga: "Ibeju-Lekki",
    areas: [
      "Ibeju-Lekki",
      "Abijo",
      "Awoyaya",
      "Lakowe",
      "Bogije",
      "Eleko",
      "Akodo",
    ],
  },
  {
    lga: "Ifako-Ijaiye",
    areas: [
      "Ifako",
      "Ijaiye",
      "Ojokoro",
      "Oke-Ira",
      "Agbado",
    ],
  },
  {
    lga: "Ikeja",
    areas: [
      "Ikeja",
      "Ikeja GRA",
      "Alausa",
      "Allen Avenue",
      "Oregun",
      "Opebi",
      "Ogba",
      "Ojodu",
      "Onigbongbo",
      "Computer Village",
      "Airport Road",
    ],
  },
  {
    lga: "Ikorodu",
    areas: [
      "Ikorodu",
      "Ikorodu North",
      "Ikorodu West",
      "Igbogbo",
      "Baiyeku",
      "Ijede",
      "Imota",
      "Odogunyan",
      "Itamaga",
      "Agric",
    ],
  },
  {
    lga: "Kosofe",
    areas: [
      "Kosofe",
      "Ketu",
      "Agboyi",
      "Ojota",
      "Gbagada",
      "Anthony",
      "Maryland",
      "Magodo",
      "Isheri",
      "Mile 12",
    ],
  },
  {
    lga: "Lagos Island",
    areas: [
      "Lagos Island",
      "Idumota",
      "Balogun",
      "Marina",
      "Broad Street",
      "Isale Eko",
      "Lafiaji",
      "Onikan",
      "Epetedo",
      "Okepopo",
    ],
  },
  {
    lga: "Lagos Mainland",
    areas: [
      "Yaba",
      "Ebute Metta",
      "Akoka",
      "Sabo",
      "Alagomeji",
      "Adekunle",
      "Abule Oja",
      "Onike",
      "Iwaya",
      "Makoko",
      "Jibowu",
      "Oyingbo",
      "Tejuosho",
    ],
  },
  {
    lga: "Mushin",
    areas: [
      "Mushin",
      "Papa Ajao",
      "Idi-Araba",
      "Ilupeju",
      "Odi-Olowo",
      "Ojuwoye",
    ],
  },
  {
    lga: "Ojo",
    areas: [
      "Ojo",
      "Iba",
      "Iyana-Iba",
      "Ajangbadi",
      "Oto-Awori",
      "Alaba",
    ],
  },
  {
    lga: "Oshodi-Isolo",
    areas: [
      "Oshodi",
      "Isolo",
      "Ejigbo",
      "Okota",
      "Ajao Estate",
      "Mafoluku",
      "Ago Palace",
    ],
  },
  {
    lga: "Shomolu",
    areas: [
      "Shomolu",
      "Bariga",
      "Pedro",
      "Onipanu",
      "Palmgrove",
      "Fadeyi",
    ],
  },
  {
    lga: "Surulere",
    areas: [
      "Surulere",
      "Ojuelegba",
      "Lawanson",
      "Itire",
      "Aguda",
      "Coker",
      "Ijeshatedo",
    ],
  },
] as const satisfies readonly AreaLgaGroup[];

/* =========================================================
   EDO STATE — 18 LGAs

   The initial area suggestions are the administrative
   headquarters of each LGA.

   These are starter locations, not a complete list of
   every town and neighbourhood in Edo State.
========================================================= */

export const EDO_AREA_GROUPS = [
  {
    lga: "Akoko-Edo",
    areas: [
      "Igarra",
    ],
  },
  {
    lga: "Egor",
    areas: [
      "Uselu",
    ],
  },
  {
    lga: "Esan Central",
    areas: [
      "Irrua",
    ],
  },
  {
    lga: "Esan North-East",
    areas: [
      "Uromi",
    ],
  },
  {
    lga: "Esan South-East",
    areas: [
      "Ubiaja",
    ],
  },
  {
    lga: "Esan West",
    areas: [
      "Ekpoma",
    ],
  },
  {
    lga: "Etsako Central",
    areas: [
      "Fugar",
    ],
  },
  {
    lga: "Etsako East",
    areas: [
      "Agenebode",
    ],
  },
  {
    lga: "Etsako West",
    areas: [
      "Auchi",
    ],
  },
  {
    lga: "Igueben",
    areas: [
      "Igueben",
    ],
  },
  {
    lga: "Ikpoba-Okha",
    aliases: [
      "Ikpoba Okha",
    ],
    areas: [
      "Idogbo",
    ],
  },
  {
    lga: "Oredo",
    areas: [
      "Benin City",
    ],
  },
  {
    lga: "Orhionmwon",
    areas: [
      "Abudu",
    ],
  },
  {
    lga: "Ovia North-East",
    aliases: [
      "Ovia North East",
    ],
    areas: [
      "Okada",
    ],
  },
  {
    lga: "Ovia South-West",
    aliases: [
      "Ovia South West",
    ],
    areas: [
      "Iguobazuwa",
    ],
  },
  {
    lga: "Owan East",
    areas: [
      "Afuze",
    ],
  },
  {
    lga: "Owan West",
    areas: [
      "Sabongida-Ora",
    ],
  },
  {
    lga: "Uhunmwonde",
    aliases: [
      "Uhunmwode",
    ],
    areas: [
      "Ehor",
    ],
  },
] as const satisfies readonly AreaLgaGroup[];

/* =========================================================
   SHARED NIGERIAN LOCATION DATA
========================================================= */

export const NIGERIA_LOCATION_GROUPS = [
  {
    state: "Lagos",
    lgas: LAGOS_AREA_GROUPS,
  },
  {
    state: "Edo",
    lgas: EDO_AREA_GROUPS,
  },
] as const satisfies readonly StateAreaGroup[];

/**
 * Current product coverage states.
 */
export const SUPPORTED_STATES: string[] =
  NIGERIA_LOCATION_GROUPS.map(
    (group) => group.state,
  );

/**
 * State dropdown options.
 */
export const PREDEFINED_STATES =
  SUPPORTED_STATES;

/**
 * All Lagos LGAs.
 */
export const PREDEFINED_LAGOS_LGAS: string[] =
  LAGOS_AREA_GROUPS.map(
    (group) => group.lga,
  );

/**
 * All Edo LGAs.
 */
export const PREDEFINED_EDO_LGAS: string[] =
  EDO_AREA_GROUPS.map(
    (group) => group.lga,
  );

/**
 * All currently supplied Lagos area suggestions.
 *
 * Retained for existing Lagos-only functionality.
 */
export const PREDEFINED_LAGOS_AREAS: string[] =
  Array.from(
    new Set(
      LAGOS_AREA_GROUPS.flatMap(
        (group) => [...group.areas],
      ),
    ),
  ).sort(
    (first, second) =>
      first.localeCompare(second, "en"),
  );

/**
 * Initial Edo area suggestions.
 *
 * These currently represent LGA headquarters.
 */
export const PREDEFINED_EDO_AREAS: string[] =
  Array.from(
    new Set(
      EDO_AREA_GROUPS.flatMap(
        (group) => [...group.areas],
      ),
    ),
  ).sort(
    (first, second) =>
      first.localeCompare(second, "en"),
  );

/**
 * Every currently supported LGA and area name.
 */
export const PREDEFINED_AREAS: string[] =
  Array.from(
    new Set(
      NIGERIA_LOCATION_GROUPS.flatMap(
        (stateGroup) =>
          stateGroup.lgas.flatMap(
            (group) => [
              group.lga,
              ...group.areas,
            ],
          ),
      ),
    ),
  ).sort(
    (first, second) =>
      first.localeCompare(second, "en"),
  );

/* =========================================================
   NORMALIZATION
========================================================= */

/**
 * Normalize an area before comparing it.
 *
 * Examples:
 * "OGBA"       -> "ogba"
 * "Ikeja GRA"  -> "ikeja gra"
 * "Oko-Oba"    -> "oko oba"
 */
export function normalizeAreaName(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Accepts values such as:
 * "Edo State" -> "edo"
 * "Lagos State" -> "lagos"
 */
function normalizeStateName(
  value: string,
): string {
  return normalizeAreaName(value).replace(
    /\s+state$/,
    "",
  );
}

/**
 * Accepts values such as:
 * "Epe LGA" -> "epe"
 */
function normalizeLgaName(
  value: string,
): string {
  return normalizeAreaName(value).replace(
    /\s+lga$/,
    "",
  );
}

/* =========================================================
   LOOKUP HELPERS
========================================================= */

function findStateGroup(
  state: string,
): StateAreaGroup | undefined {
  const normalized = normalizeStateName(state);

  return NIGERIA_LOCATION_GROUPS.find(
    (group) =>
      normalizeStateName(group.state) ===
      normalized,
  );
}

function matchesLga(
  group: AreaLgaGroup,
  value: string,
): boolean {
  const normalized = normalizeLgaName(value);

  if (
    normalizeLgaName(group.lga) === normalized
  ) {
    return true;
  }

  return (
    group.aliases?.some(
      (alias) =>
        normalizeLgaName(alias) === normalized,
    ) ?? false
  );
}

function findLgaGroup(
  state: string,
  lga: string,
): AreaLgaGroup | undefined {
  const stateGroup = findStateGroup(state);

  return stateGroup?.lgas.find(
    (group) => matchesLga(group, lga),
  );
}

/* =========================================================
   STATE HELPERS
========================================================= */

/**
 * Resolve a state name to its canonical spelling.
 */
export function resolvePredefinedState(
  value: string,
): string | null {
  return findStateGroup(value)?.state ?? null;
}

/**
 * Return the LGAs belonging to a state.
 */
export function getLgasForState(
  state: string,
): string[] {
  const group = findStateGroup(state);

  return group
    ? group.lgas.map((item) => item.lga)
    : [];
}

/* =========================================================
   LGA HELPERS
========================================================= */

/**
 * Resolve an LGA to its canonical spelling.
 *
 * Example:
 * resolvePredefinedLga("Edo", "Ikpoba Okha")
 * returns "Ikpoba-Okha".
 */
export function resolvePredefinedLga(
  state: string,
  lga: string,
): string | null {
  const stateGroup = findStateGroup(state);

  if (!stateGroup) return null;

  const found = stateGroup.lgas.find(
    (group) => matchesLga(group, lga),
  );

  return found?.lga ?? null;
}

/**
 * Validate whether an LGA belongs to a state.
 */
export function lgasMatch(
  state: string,
  first: string | null,
  second: string | null,
): boolean {
  if (!first || !second) return false;

  const canonicalFirst =
    resolvePredefinedLga(state, first);

  const canonicalSecond =
    resolvePredefinedLga(state, second);

  return Boolean(
    canonicalFirst &&
    canonicalSecond &&
    canonicalFirst === canonicalSecond,
  );
}

/* =========================================================
   AREA HELPERS
========================================================= */

/**
 * Get the known area suggestions for one LGA.
 *
 * The LGA itself is included as a valid coarse
 * location option.
 *
 * Example:
 * getAreasForLga("Edo", "Esan West")
 *
 * Returns:
 * ["Esan West", "Ekpoma"]
 */
export function getAreasForLga(
  state: string,
  lga: string,
): string[] {
  const group = findLgaGroup(state, lga);

  if (!group) return [];

  return Array.from(
    new Set([
      group.lga,
      ...group.areas,
    ]),
  );
}

/**
 * Resolve an area within a specific state and LGA.
 *
 * When allowCustom is true, a non-empty area can be
 * accepted after its state and LGA have been validated.
 *
 * Use allowCustom for manually verified neighbourhoods
 * that have not yet been added to the vocabulary.
 */
export function resolvePredefinedAreaForLga(
  state: string,
  lga: string,
  value: string,
  allowCustom = false,
): string | null {
  const group = findLgaGroup(state, lga);

  if (!group) return null;

  const normalized = normalizeAreaName(value);

  if (!normalized) return null;

  const knownAreas = [
    group.lga,
    ...group.areas,
  ];

  const match = knownAreas.find(
    (area) =>
      normalizeAreaName(area) === normalized,
  );

  if (match) return match;

  return allowCustom
    ? value.trim()
    : null;
}

/**
 * Resolve an area within any supported state.
 *
 * This is useful for older forms that only have
 * one area input without a separate LGA selection.
 */
export function resolvePredefinedAreaForState(
  state: string,
  value: string,
): string | null {
  const stateGroup = findStateGroup(state);

  if (!stateGroup) return null;

  const normalized = normalizeAreaName(value);

  if (!normalized) return null;

  for (const group of stateGroup.lgas) {
    const candidates = [
      group.lga,
      ...group.areas,
    ];

    const found = candidates.find(
      (area) =>
        normalizeAreaName(area) === normalized,
    );

    if (found) return found;
  }

  return null;
}

/**
 * Original Lagos-only resolver.
 *
 * Preserved so existing Near Me API validation,
 * admin forms and older components continue working.
 */
export function resolvePredefinedArea(
  value: string,
): string | null {
  const normalized = normalizeAreaName(value);

  if (!normalized) return null;

  return (
    PREDEFINED_LAGOS_AREAS.find(
      (area) =>
        normalizeAreaName(area) === normalized,
    ) ?? null
  );
}

/* =========================================================
   LOCATION AUTOCOMPLETE / PREFETCH HELPERS
========================================================= */

/**
 * Generate state, LGA and area suggestions.
 *
 * Examples:
 *
 * getLocationSuggestions({
 *   state: "Edo",
 * })
 *
 * getLocationSuggestions({
 *   state: "Edo",
 *   lga: "Esan West",
 * })
 *
 * getLocationSuggestions({
 *   query: "Uromi",
 * })
 *
 * The returned data can be used directly by the
 * product filter and search autocomplete.
 */
export function getLocationSuggestions(
  options: LocationSuggestionOptions = {},
): LocationSuggestion[] {
  const {
    state,
    lga,
    query = "",
    limit = 30,
  } = options;

  const normalizedQuery =
    normalizeAreaName(query);

  const result: LocationSuggestion[] = [];

  for (const stateGroup of NIGERIA_LOCATION_GROUPS) {
    if (
      state &&
      normalizeStateName(stateGroup.state) !==
        normalizeStateName(state)
    ) {
      continue;
    }

    for (const lgaGroup of stateGroup.lgas) {
      if (
        lga &&
        !matchesLga(lgaGroup, lga)
      ) {
        continue;
      }

      /* LGA-LEVEL SUGGESTION */

      result.push({
        state: stateGroup.state,
        lga: lgaGroup.lga,
        area: lgaGroup.lga,
        level: "LGA",
        label: `${lgaGroup.lga}, ${stateGroup.state}`,
      });

      /* AREA-LEVEL SUGGESTIONS */

      for (const area of lgaGroup.areas) {
        if (
          normalizeAreaName(area) ===
          normalizeAreaName(lgaGroup.lga)
        ) {
          continue;
        }

        result.push({
          state: stateGroup.state,
          lga: lgaGroup.lga,
          area,
          level: "AREA",
          label: `${area}, ${lgaGroup.lga}, ${stateGroup.state}`,
        });
      }
    }
  }

  const filtered = normalizedQuery
    ? result.filter((item) => {
        const searchable = normalizeAreaName(
          `${item.area} ${item.lga} ${item.state}`,
        );

        return searchable.includes(normalizedQuery);
      })
    : result;

  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? Math.min(limit, 100)
      : 30;

  return filtered.slice(0, safeLimit);
}

/**
 * Case-insensitive comparison of two areas.
 */
export function areasMatch(
  first: string | null,
  second: string | null,
): boolean {
  if (!first || !second) return false;

  const normalizedFirst =
    normalizeAreaName(first);

  const normalizedSecond =
    normalizeAreaName(second);

  return Boolean(
    normalizedFirst &&
    normalizedSecond &&
    normalizedFirst === normalizedSecond,
  );
}

/**
 * Compare state names.
 */
export function statesMatch(
  first: string | null,
  second: string | null,
): boolean {
  if (!first || !second) return false;

  return (
    normalizeStateName(first) ===
    normalizeStateName(second)
  );
}
