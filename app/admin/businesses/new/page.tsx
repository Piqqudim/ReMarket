"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Store,
} from "lucide-react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import ImageUpload from "@/components/ImageUpload";

import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

type Category = ReMarketCategory;

type SocialLinkInput = {
  platform:
    | "WHATSAPP"
    | "INSTAGRAM"
    | "TIKTOK"
    | "FACEBOOK"
    | "PHONE"
    | "DIRECTIONS";
  handle: string;
};

/*
 * Controlled Lagos area vocabulary.
 *
 * The list is grouped by LGA for easier selection.
 * The selected neighborhood/area value is stored
 * in the existing Location.area field.
 *
 * This is intentionally kept in this page for now
 * so we do not introduce another location system.
 */
const LAGOS_AREA_GROUPS = [
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

const DEFAULT_COUNTRY = "Nigeria";

export default function NewBusinessPage() {
  const router = useRouter();

  const [name, setName] =
    useState("");

  const [ownerName, setOwnerName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [area, setArea] =
    useState("");

  const [houseNumber, setHouseNumber] =
    useState("");

  const [street, setStreet] =
    useState("");

  const [city, setCity] =
    useState("Lagos");

  /*
   * Coordinates remain internal.
   *
   * GPS capture is optional.
   *
   * When coordinates are not captured,
   * the Admin API can resolve the location
   * from the business address.
   */
  const [lat, setLat] =
    useState("");

  const [lng, setLng] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [priceMin, setPriceMin] =
    useState("");

  const [priceMax, setPriceMax] =
    useState("");

  const [availability, setAvailability] =
    useState<
      | "AVAILABLE"
      | "ASK_SELLER"
      | "UNAVAILABLE"
    >("ASK_SELLER");

  const [status, setStatus] =
    useState<
      | "ACTIVE"
      | "INACTIVE"
      | "PENDING"
    >("ACTIVE");

  const [verification, setVerification] =
    useState<
      | "VERIFIED"
      | "UNVERIFIED"
    >("UNVERIFIED");

  const [imageUrl, setImageUrl] =
    useState("");

  /*
   * Shared ReMarket category system.
   *
   * Backend categories are the only categories
   * whose IDs can be submitted to the database.
   *
   * DEFAULT_CATEGORIES is display fallback only.
   */
  const [categories, setCategories] =
    useState<Category[]>(
      DEFAULT_CATEGORIES
    );

  const [
    usingCategoryFallback,
    setUsingCategoryFallback,
  ] = useState(true);

  const [
    selectedCategoryIds,
    setSelectedCategoryIds,
  ] = useState<string[]>([]);

  const [socialLinks, setSocialLinks] =
    useState<SocialLinkInput[]>([]);

  const [
    loadingCategories,
    setLoadingCategories,
  ] = useState(true);

  const [locating, setLocating] =
    useState(false);

  const [
    locationStatus,
    setLocationStatus,
  ] = useState("");

  const [
    locationError,
    setLocationError,
  ] = useState("");

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadCategories() {
      try {
        const response =
          await fetch(
            "/api/categories",
            {
              cache: "no-store",
              signal:
                controller.signal,
            }
          );

        if (!response.ok) {
          throw new Error(
            "Unable to load categories."
          );
        }

        const data: unknown =
          await response.json();

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data)
        ) {
          throw new Error(
            "Invalid categories response."
          );
        }

        const payload =
          data as {
            categories?: unknown;
          };

        const backendCategories =
          Array.isArray(
            payload.categories
          )
            ? payload.categories.filter(
                (
                  item
                ): item is ApiCategory =>
                  Boolean(
                    item &&
                      typeof item ===
                        "object" &&
                      !Array.isArray(
                        item
                      ) &&
                      typeof (
                        item as Record<
                          string,
                          unknown
                        >
                      ).id ===
                        "string" &&
                      typeof (
                        item as Record<
                          string,
                          unknown
                        >
                      ).name ===
                        "string"
                  )
              )
            : [];

        /*
         * Use the shared category merge utility.
         * This preserves backend IDs and backend
         * active-state behavior.
         */
        const mergedCategories =
          mergeCategories(
            backendCategories
          );

        if (
          mergedCategories.length > 0
        ) {
          setCategories(
            mergedCategories
          );

          setUsingCategoryFallback(
            false
          );
        } else {
          setCategories(
            DEFAULT_CATEGORIES
          );

          setUsingCategoryFallback(
            true
          );
        }
      } catch (loadError) {
        if (
          loadError instanceof
            DOMException &&
          loadError.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Categories error:",
          loadError
        );

        /*
         * The built-in categories remain visible,
         * but their synthetic fallback IDs must
         * never be sent to the database.
         */
        setCategories(
          DEFAULT_CATEGORIES
        );

        setUsingCategoryFallback(
          true
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoadingCategories(
            false
          );
        }
      }
    }

    void loadCategories();

    return () => {
      controller.abort();
    };
  }, []);

  function toggleCategory(
    categoryId: string
  ) {
    /*
     * Never submit fallback/synthetic IDs.
     */
    if (usingCategoryFallback) {
      setError(
        "Categories could not be loaded from the database. Please refresh and try again before assigning categories."
      );

      return;
    }

    setError("");

    setSelectedCategoryIds(
      (current) =>
        current.includes(
          categoryId
        )
          ? current.filter(
              (id) =>
                id !==
                categoryId
            )
          : [
              ...current,
              categoryId,
            ]
    );
  }

  function captureCurrentLocation() {
    setLocationError("");
    setLocationStatus("");

    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    if (
      !navigator.geolocation
    ) {
      setLocationError(
        "Location services are not available on this device."
      );

      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude =
          position.coords.latitude;

        const longitude =
          position.coords.longitude;

        if (
          !Number.isFinite(
            latitude
          ) ||
          !Number.isFinite(
            longitude
          )
        ) {
          setLocationError(
            "We couldn't get a valid business location."
          );

          setLocating(false);

          return;
        }

        setLat(
          String(latitude)
        );

        setLng(
          String(longitude)
        );

        setLocationStatus(
          "Exact business location captured."
        );

        setLocating(false);
      },

      (geoError) => {
        console.error(
          "Business location error:",
          geoError
        );

        let message =
          "We couldn't get the business location.";

        if (
          geoError.code ===
          geoError.PERMISSION_DENIED
        ) {
          message =
            "Location permission was denied. Allow location access and try again.";
        } else if (
          geoError.code ===
          geoError.POSITION_UNAVAILABLE
        ) {
          message =
            "Your device could not determine its current location.";
        } else if (
          geoError.code ===
          geoError.TIMEOUT
        ) {
          message =
            "Location detection timed out. Please try again.";
        }

        setLocationError(
          message
        );

        setLocating(false);
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  }

  function addSocialLink() {
    setSocialLinks(
      (current) => [
        ...current,
        {
          platform:
            "WHATSAPP",
          handle: "",
        },
      ]
    );
  }

  function updateSocialLink(
    index: number,
    field:
      | "platform"
      | "handle",
    value: string
  ) {
    setSocialLinks(
      (current) =>
        current.map(
          (
            link,
            linkIndex
          ) =>
            linkIndex === index
              ? {
                  ...link,
                  [field]:
                    value,
                }
              : link
        )
    );
  }

  function removeSocialLink(
    index: number
  ) {
    setSocialLinks(
      (current) =>
        current.filter(
          (
            _,
            linkIndex
          ) =>
            linkIndex !== index
        )
    );
  }

  async function submit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const trimmedName =
      name.trim();

    const trimmedArea =
      area.trim();

    const trimmedHouseNumber =
      houseNumber.trim();

    const trimmedStreet =
      street.trim();

    const trimmedCity =
      city.trim();

    const composedAddress =
      [
        trimmedHouseNumber,
        trimmedStreet,
        trimmedCity,
        trimmedArea,
        DEFAULT_COUNTRY,
      ]
        .filter(Boolean)
        .join(", ");

    if (!trimmedName) {
      setError(
        "Business name is required."
      );

      return;
    }

    if (!trimmedArea) {
      setError(
        "Business area is required."
      );

      return;
    }

    if (!trimmedStreet) {
      setError(
        "Street, road, or close is required."
      );

      return;
    }

    if (!trimmedCity) {
      setError(
        "City is required."
      );

      return;
    }

    /*
     * GPS is optional.
     *
     * If the admin captured the device location,
     * send the captured coordinates.
     *
     * Otherwise send null coordinates and let
     * the Admin API resolve the business location
     * from the address through Nominatim.
     */
    const parsedLat =
      lat.trim()
        ? Number(lat)
        : null;

    const parsedLng =
      lng.trim()
        ? Number(lng)
        : null;

    /*
     * Coordinates must always be supplied
     * as a complete pair when present.
     */
    if (
      (parsedLat === null) !==
      (parsedLng === null)
    ) {
      setError(
        "Business coordinates must be captured as a complete location pair."
      );

      return;
    }

    if (
      parsedLat !== null &&
      (
        !Number.isFinite(
          parsedLat
        ) ||
        parsedLat < -90 ||
        parsedLat > 90
      )
    ) {
      setError(
        "The captured business latitude is invalid."
      );

      return;
    }

    if (
      parsedLng !== null &&
      (
        !Number.isFinite(
          parsedLng
        ) ||
        parsedLng < -180 ||
        parsedLng > 180
      )
    ) {
      setError(
        "The captured business longitude is invalid."
      );

      return;
    }

    const parsedPriceMin =
      priceMin.trim()
        ? Number(priceMin)
        : null;

    const parsedPriceMax =
      priceMax.trim()
        ? Number(priceMax)
        : null;

    if (
      parsedPriceMin !== null &&
      (
        !Number.isInteger(
          parsedPriceMin
        ) ||
        parsedPriceMin < 0
      )
    ) {
      setError(
        "Minimum price must be a valid non-negative integer."
      );

      return;
    }

    if (
      parsedPriceMax !== null &&
      (
        !Number.isInteger(
          parsedPriceMax
        ) ||
        parsedPriceMax < 0
      )
    ) {
      setError(
        "Maximum price must be a valid non-negative integer."
      );

      return;
    }

    if (
      parsedPriceMin !== null &&
      parsedPriceMax !== null &&
      parsedPriceMin >
        parsedPriceMax
    ) {
      setError(
        "Minimum price cannot be greater than maximum price."
      );

      return;
    }

    /*
     * Never submit synthetic category IDs from
     * the fallback UI.
     */
    const categoryIds =
      usingCategoryFallback
        ? []
        : selectedCategoryIds;

    setSaving(true);

    try {
      const response =
        await fetch(
          "/api/admin/businesses",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              name:
                trimmedName,

              ownerName:
                ownerName.trim() ||
                null,

              description:
                description.trim() ||
                null,

              area:
                trimmedArea,

              /*
               * Store the structured address in
               * the existing Location.address field.
               */
              address:
                composedAddress,

              /*
               * Coordinates are optional.
               *
               * When present they came from
               * browser geolocation.
               *
               * When null, the Admin API will
               * attempt address geocoding.
               *
               * The database field is Location.long.
               */
              lat:
                parsedLat,

              long:
                parsedLng,

              phone:
                phone.trim() ||
                null,

              priceMin:
                parsedPriceMin,

              priceMax:
                parsedPriceMax,

              availability,

              status,

              verification,

              imageUrl:
                imageUrl.trim() ||
                null,

              categoryIds,

              socialLinks:
                socialLinks
                  .map(
                    (link) => ({
                      platform:
                        link.platform,

                      handle:
                        link.handle.trim(),
                    })
                  )
                  .filter(
                    (link) =>
                      link.handle
                  ),
            }),
          }
        );

      const data: unknown =
        await response.json();

      if (!response.ok) {
        const apiError =
          data &&
          typeof data ===
            "object" &&
          !Array.isArray(data)
            ? (
                data as Record<
                  string,
                  unknown
                >
              ).error
            : null;

        throw new Error(
          typeof apiError ===
            "string"
            ? apiError
            : "Unable to create business."
        );
      }

      const createdBusiness =
        data &&
        typeof data ===
          "object" &&
        !Array.isArray(data)
          ? (
              data as Record<
                string,
                unknown
              >
            ).business
          : null;

      const createdBusinessId =
        createdBusiness &&
        typeof createdBusiness ===
          "object" &&
        !Array.isArray(
          createdBusiness
        )
          ? (
              createdBusiness as Record<
                string,
                unknown
              >
            ).id
          : null;

      if (
        typeof createdBusinessId !==
        "string"
      ) {
        throw new Error(
          "Business was created but no business ID was returned."
        );
      }

      router.push(
        `/admin/businesses/${createdBusinessId}`
      );
    } catch (submitError) {
      console.error(
        "Create business error:",
        submitError
      );

      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "Unable to create business."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[1100px]">
        <Link
          href="/admin/businesses"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 transition hover:text-[#9F2D18]"
        >
          <ArrowLeft className="h-4 w-4" />

          Back to businesses
        </Link>

        <div className="mt-5 overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
          <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <h1 className="text-xl font-bold text-[#17202A]">
                  Add business
                </h1>

                <p className="mt-0.5 text-xs text-gray-500">
                  Add a local business to ReMarket.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={
              submit
            }
            className="space-y-7 p-5 sm:p-7"
          >
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            {/* BUSINESS DETAILS */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Business details
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Business name
                  </label>

                  <input
                    value={
                      name
                    }
                    onChange={(
                      event
                    ) =>
                      setName(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="e.g. Mandy Treasures"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Owner name
                  </label>

                  <input
                    value={
                      ownerName
                    }
                    onChange={(
                      event
                    ) =>
                      setOwnerName(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-700">
                    Description
                  </label>

                  <textarea
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) =>
                      setDescription(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="What does this business sell or offer?"
                    rows={
                      4
                    }
                    className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-white px-3 py-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>
              </div>
            </section>

            {/* IMAGE */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Business image
              </h2>

              <p className="mt-1 text-[11px] text-gray-500">
                Optional. This appears on buyer-facing business cards.
              </p>

              <div className="mt-4 max-w-[520px]">
                <ImageUpload
                  value={
                    imageUrl ||
                    undefined
                  }
                  onChange={
                    setImageUrl
                  }
                  disabled={
                    saving
                  }
                />
              </div>
            </section>

            {/* LOCATION */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Location
              </h2>

              <p className="mt-1 max-w-[760px] text-[11px] leading-5 text-gray-500">
                Choose the business area from the standardized Lagos
                list and enter the physical address. ReMarket can use
                the device location when available, or determine the
                business coordinates from the address automatically.
                You do not need to type latitude or longitude.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    House / Shop / Building number
                  </label>

                  <input
                    value={
                      houseNumber
                    }
                    onChange={(
                      event
                    ) =>
                      setHouseNumber(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="e.g. Shop 12"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />

                  <p className="mt-1.5 text-[10px] text-gray-400">
                    Optional where no number exists.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Street / Road / Close
                  </label>

                  <input
                    value={
                      street
                    }
                    onChange={(
                      event
                    ) =>
                      setStreet(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="e.g. Adewale Close"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    City
                  </label>

                  <input
                    value={
                      city
                    }
                    onChange={(
                      event
                    ) =>
                      setCity(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="e.g. Lagos or Epe"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Area / Region
                  </label>

                  <select
                    value={
                      area
                    }
                    onChange={(
                      event
                    ) =>
                      setArea(
                        event
                          .target
                          .value
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  >
                    <option value="">
                      Select an area
                    </option>

                    {LAGOS_AREA_GROUPS.map(
                      (
                        group
                      ) => (
                        <optgroup
                          key={
                            group.lga
                          }
                          label={
                            group.lga
                          }
                        >
                          {group.areas.map(
                            (
                              item
                            ) => (
                              <option
                                key={
                                  `${group.lga}-${item}`
                                }
                                value={
                                  item
                                }
                              >
                                {
                                  item
                                }
                              </option>
                            )
                          )}
                        </optgroup>
                      )
                    )}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-700">
                    Country
                  </label>

                  <input
                    value={
                      DEFAULT_COUNTRY
                    }
                    readOnly
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-gray-50 px-3 text-xs text-gray-600 outline-none"
                  />

                  <p className="mt-1.5 text-[10px] text-gray-400">
                    Country is fixed to Nigeria for this Lagos location workflow.
                  </p>
                </div>
              </div>

              {(
                houseNumber ||
                street ||
                city ||
                area
              ) && (
                <div className="mt-4 rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Address that will be saved
                  </p>

                  <p className="mt-1 text-xs font-medium text-[#17202A]">
                    {[
                      houseNumber.trim(),
                      street.trim(),
                      city.trim(),
                      area.trim(),
                      DEFAULT_COUNTRY,
                    ]
                      .filter(Boolean)
                      .join(", ") ||
                      "Complete the address fields above."}
                  </p>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-[#E8E4DE] bg-white p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                      <MapPin className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-xs font-bold text-[#17202A]">
                        Exact business location
                      </p>

                      <p className="mt-1 text-[10px] leading-4 text-gray-500">
                        Used internally for Near Me and Directions.
                        GPS capture is optional when the business
                        address can be resolved.
                      </p>

                      {locationStatus && (
                        <p className="mt-2 text-[10px] font-semibold text-[#137A59]">
                          {
                            locationStatus
                          }
                        </p>
                      )}

                      {locationError && (
                        <p className="mt-2 text-[10px] font-medium text-red-600">
                          {
                            locationError
                          }
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={
                      captureCurrentLocation
                    }
                    disabled={
                      locating ||
                      saving
                    }
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {locating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : lat &&
                      lng ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}

                    {locating
                      ? "Getting location..."
                      : lat &&
                          lng
                        ? "Recapture location"
                        : "Use current location"}
                  </button>
                </div>

                {lat &&
                  lng && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#F7FBF8] px-3 py-2.5">
                      <MapPin className="h-3.5 w-3.5 text-[#137A59]" />

                      <p className="text-[10px] font-medium text-[#137A59]">
                        Exact business location is ready to save.
                      </p>
                    </div>
                  )}

                {!lat &&
                  !lng && (
                    <div className="mt-3 rounded-lg bg-[#FCFAF6] px-3 py-2.5">
                      <p className="text-[10px] font-medium text-gray-500">
                        GPS capture is optional. When no GPS position
                        is captured, ReMarket will try to determine
                        the business coordinates from the address.
                      </p>
                    </div>
                  )}
              </div>
            </section>

            {/* CATEGORIES */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Categories
              </h2>

              <p className="mt-1 text-[11px] text-gray-500">
                Select all categories that describe this business.
              </p>

              {usingCategoryFallback &&
                !loadingCategories && (
                  <p className="mt-2 text-[10px] font-medium text-amber-600">
                    Built-in categories are shown while the database categories are unavailable. Refresh before assigning categories.
                  </p>
                )}

              {loadingCategories ? (
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />

                  Loading categories...
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {categories.map(
                    (
                      item
                    ) => {
                      const active =
                        selectedCategoryIds.includes(
                          item.id
                        );

                      const disabled =
                        usingCategoryFallback;

                      return (
                        <button
                          key={
                            item.id
                          }
                          type="button"
                          disabled={
                            disabled
                          }
                          onClick={() =>
                            toggleCategory(
                              item.id
                            )
                          }
                          className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
                            disabled
                              ? "cursor-not-allowed border-[#E8E4DE] bg-gray-50 text-gray-400"
                              : active
                                ? "border-[#FFB09B] bg-[#FFF1ED] text-[#9F2D18]"
                                : "border-[#E8E4DE] bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {
                            item.name
                          }
                        </button>
                      );
                    }
                  )}
                </div>
              )}
            </section>

            {/* CONTACT / PRICING */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Contact and pricing
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Phone
                  </label>

                  <input
                    value={
                      phone
                    }
                    onChange={(
                      event
                    ) =>
                      setPhone(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Minimum price
                  </label>

                  <input
                    value={
                      priceMin
                    }
                    onChange={(
                      event
                    ) =>
                      setPriceMin(
                        event
                          .target
                          .value
                      )
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Maximum price
                  </label>

                  <input
                    value={
                      priceMax
                    }
                    onChange={(
                      event
                    ) =>
                      setPriceMax(
                        event
                          .target
                          .value
                      )
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>
              </div>
            </section>

            {/* STATUS */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Status
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Availability
                  </label>

                  <select
                    value={
                      availability
                    }
                    onChange={(
                      event
                    ) =>
                      setAvailability(
                        event
                          .target
                          .value as typeof availability
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                  >
                    <option value="AVAILABLE">
                      Available
                    </option>

                    <option value="ASK_SELLER">
                      Ask seller
                    </option>

                    <option value="UNAVAILABLE">
                      Unavailable
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Business status
                  </label>

                  <select
                    value={
                      status
                    }
                    onChange={(
                      event
                    ) =>
                      setStatus(
                        event
                          .target
                          .value as typeof status
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                  >
                    <option value="ACTIVE">
                      Active
                    </option>

                    <option value="INACTIVE">
                      Inactive
                    </option>

                    <option value="PENDING">
                      Pending
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Verification
                  </label>

                  <select
                    value={
                      verification
                    }
                    onChange={(
                      event
                    ) =>
                      setVerification(
                        event
                          .target
                          .value as typeof verification
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                  >
                    <option value="UNVERIFIED">
                      Unverified
                    </option>

                    <option value="VERIFIED">
                      Verified
                    </option>
                  </select>
                </div>
              </div>
            </section>

            {/* SOCIAL LINKS */}

            <section>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#17202A]">
                    Social and contact links
                  </h2>

                  <p className="mt-1 text-[11px] text-gray-500">
                    Optional direct-contact details.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    addSocialLink
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:border-[#FFB09B] hover:text-[#9F2D18]"
                >
                  <Plus className="h-3.5 w-3.5" />

                  Add link
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {socialLinks.map(
                  (
                    link,
                    index
                  ) => (
                    <div
                      key={
                        index
                      }
                      className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"
                    >
                      <select
                        value={
                          link.platform
                        }
                        onChange={(
                          event
                        ) =>
                          updateSocialLink(
                            index,
                            "platform",
                            event
                              .target
                              .value
                          )
                        }
                        className="h-11 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                      >
                        <option value="WHATSAPP">
                          WhatsApp
                        </option>

                        <option value="INSTAGRAM">
                          Instagram
                        </option>

                        <option value="TIKTOK">
                          TikTok
                        </option>

                        <option value="FACEBOOK">
                          Facebook
                        </option>

                        <option value="PHONE">
                          Phone
                        </option>

                        <option value="DIRECTIONS">
                          Directions
                        </option>
                      </select>

                      <input
                        value={
                          link.handle
                        }
                        onChange={(
                          event
                        ) =>
                          updateSocialLink(
                            index,
                            "handle",
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Handle, number or value"
                        className="h-11 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          removeSocialLink(
                            index
                          )
                        }
                        className="h-11 rounded-xl border border-[#E8E4DE] px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Remove
                      </button>
                    </div>
                  )
                )}
              </div>
            </section>

            {/* ACTIONS */}

            <div className="flex justify-end gap-2 border-t border-[#EAE6DF] pt-5">
              <Link
                href="/admin/businesses"
                className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={
                  saving ||
                  locating
                }
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {saving
                  ? "Creating..."
                  : "Create business"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}