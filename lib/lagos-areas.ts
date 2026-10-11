/**
 * Shared Lagos area vocabulary.
 *
 * Used by:
 * - Near Me API validation
 * - Near Me area picker
 * - Admin business creation and editing
 *
 * Area entries are carried over from the existing
 * Admin New Business form.
 */

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
] as const;

/**
 * Flat, unique, alphabetically sorted list for
 * validation and search controls.
 */
export const PREDEFINED_LAGOS_AREAS: string[] =
  Array.from(
    new Set(
      LAGOS_AREA_GROUPS.flatMap(
        (group) => [...group.areas]
      )
    )
  ).sort(
    (first, second) =>
      first.localeCompare(second, "en")
  );

/**
 * Normalize an area before comparing it.
 *
 * Examples:
 * "OGBA"       -> "ogba"
 * "Ikeja GRA"  -> "ikeja gra"
 * "Oko-Oba"    -> "oko oba"
 */
export function normalizeAreaName(
  value: string
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
 * Return the canonical spelling only if the
 * supplied area exists in the predefined list.
 */
export function resolvePredefinedArea(
  value: string
): string | null {
  const normalized = normalizeAreaName(value);

  if (!normalized) {
    return null;
  }

  return (
    PREDEFINED_LAGOS_AREAS.find(
      (area) =>
        normalizeAreaName(area) === normalized
    ) ?? null
  );
}

/**
 * Case-insensitive comparison of two areas.
 */
export function areasMatch(
  first: string | null,
  second: string | null
): boolean {
  if (!first || !second) {
    return false;
  }

  const normalizedFirst =
    normalizeAreaName(first);

  const normalizedSecond =
    normalizeAreaName(second);

  return Boolean(
    normalizedFirst &&
    normalizedSecond &&
    normalizedFirst === normalizedSecond
  );
}