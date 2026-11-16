
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  ChevronDown,
  Loader2,
  MapPin,
} from "lucide-react";

type AreaGroup = {
  lga: string;
  areas: string[];
};

type StateGroup = {
  state: string;
  groups: AreaGroup[];
};

/**
 * Complete location returned when a suggestion is selected.
 * Exported so other components can use the same location type.
 */
export type AreaSelection = {
  state: string;
  lga: string;
  area: string;
};

type AreaOption = AreaSelection;

type AreaAutocompleteProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;

  /**
   * Optional filters for an already-selected state or LGA.
   */
  state?: string;
  lga?: string;

  /**
   * Receives the complete location when a suggestion is selected.
   */
  onSelect?: (location: AreaSelection) => void;

  placeholder?: string;
  disabled?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseAreaGroups(value: unknown): AreaGroup[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw): AreaGroup[] => {
    if (
      !isRecord(raw) ||
      typeof raw.lga !== "string" ||
      !Array.isArray(raw.areas)
    ) {
      return [];
    }

    const lga = raw.lga.trim();

    const areas = Array.from(
      new Set(
        raw.areas.flatMap((area) => {
          if (typeof area !== "string") return [];

          const cleaned = area.trim();

          return cleaned ? [cleaned] : [];
        }),
      ),
    );

    if (!lga || areas.length === 0) return [];

    return [
      {
        lga,
        areas,
      },
    ];
  });
}

/**
 * Expected state-aware API structure:
 *
 * {
 *   stateGroups: [
 *     {
 *       state: "Lagos",
 *       lgas: [
 *         { lga: "Epe", areas: ["Epe", "Eredo"] }
 *       ]
 *     },
 *     {
 *       state: "Edo",
 *       lgas: [
 *         { lga: "Esan West", areas: ["Ekpoma"] }
 *       ]
 *     }
 *   ]
 * }
 *
 * Also supports `groups` instead of `lgas`.
 */
function parseStateGroups(value: unknown): StateGroup[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw): StateGroup[] => {
    if (!isRecord(raw)) return [];

    const stateName =
      typeof raw.state === "string"
        ? raw.state.trim()
        : typeof raw.name === "string"
          ? raw.name.trim()
          : "";

    const rawGroups = Array.isArray(raw.lgas)
      ? raw.lgas
      : Array.isArray(raw.groups)
        ? raw.groups
        : [];

    if (!stateName) return [];

    const groups = parseAreaGroups(rawGroups);

    if (groups.length === 0) return [];

    return [
      {
        state: stateName,
        groups,
      },
    ];
  });
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export default function AreaAutocomplete({
  id,
  value,
  onChange,
  state,
  lga,
  onSelect,
  placeholder = "Start typing an area...",
  disabled = false,
}: AreaAutocompleteProps) {
  const [stateGroups, setStateGroups] = useState<StateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /* ------------------------------------------------------------------------ */
  /* LOAD LOCATION CATALOGUE                                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();

    async function preloadAreas() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/areas", {
          method: "GET",
          cache: "force-cache",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load area suggestions.");
        }

        const payload: unknown = await response.json();

        if (!isRecord(payload)) {
          throw new Error(
            "The area service returned an invalid response.",
          );
        }

        let parsed = parseStateGroups(payload.stateGroups);

        /*
         * Backward compatibility:
         * Previous API returned:
         * { areas, groups }
         *
         * Treat those legacy groups as Lagos locations.
         */
        if (parsed.length === 0) {
          const legacyGroups = parseAreaGroups(payload.groups);

          if (legacyGroups.length > 0) {
            parsed = [
              {
                state: "Lagos",
                groups: legacyGroups,
              },
            ];
          }
        }

        if (parsed.length === 0) {
          throw new Error(
            "No predefined location suggestions are available right now.",
          );
        }

        if (!controller.signal.aborted) {
          setStateGroups(parsed);
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (!controller.signal.aborted) {
          console.error(
            "Area autocomplete preload error:",
            error,
          );

          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load area suggestions.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void preloadAreas();

    return () => controller.abort();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* FILTER LOCATION SUGGESTIONS                                              */
  /* ------------------------------------------------------------------------ */

  const filteredGroups = useMemo(() => {
    const query = normalize(value);
    const selectedState = normalize(state ?? "");
    const selectedLga = normalize(lga ?? "");

    return stateGroups
      .filter((stateGroup) => {
        return (
          !selectedState ||
          normalize(stateGroup.state) === selectedState
        );
      })
      .map((stateGroup) => {
        const stateMatches =
          query.length > 0 &&
          normalize(stateGroup.state).includes(query);

        const groups = stateGroup.groups
          .filter((group) => {
            return (
              !selectedLga ||
              normalize(group.lga) === selectedLga
            );
          })
          .map((group) => {
            const lgaMatches =
              query.length > 0 &&
              normalize(group.lga).includes(query);

            const areas = group.areas.filter((area) => {
              if (!query) return true;

              return (
                stateMatches ||
                lgaMatches ||
                normalize(area).includes(query)
              );
            });

            return {
              ...group,
              areas,
            };
          })
          .filter((group) => group.areas.length > 0);

        return {
          ...stateGroup,
          groups,
        };
      })
      .filter((stateGroup) => stateGroup.groups.length > 0);
  }, [stateGroups, value, state, lga]);

  /* ------------------------------------------------------------------------ */
  /* FLATTEN SUGGESTIONS                                                      */
  /* ------------------------------------------------------------------------ */

  const suggestions = useMemo<AreaOption[]>(() => {
    return filteredGroups.flatMap((stateGroup) =>
      stateGroup.groups.flatMap((group) =>
        group.areas.map((area) => ({
          state: stateGroup.state,
          lga: group.lga,
          area,
        })),
      ),
    );
  }, [filteredGroups]);

  /* ------------------------------------------------------------------------ */
  /* KEYBOARD SELECTION                                                      */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(
        current,
        Math.max(0, suggestions.length - 1),
      ),
    );
  }, [suggestions.length]);

  /* ------------------------------------------------------------------------ */
  /* CLOSE DROPDOWN WHEN CLICKING OUTSIDE                                    */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (
        wrapperRef.current &&
        event.target instanceof Node &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      handleOutsidePointerDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
      );
    };
  }, [open]);

  /* ------------------------------------------------------------------------ */
  /* SELECT LOCATION                                                         */
  /* ------------------------------------------------------------------------ */

  function selectArea(option: AreaSelection) {
    // Keep the existing string-based callback.
    onChange(option.area);

    // Return all three location values to the parent.
    onSelect?.({
      state: option.state,
      lga: option.lga,
      area: option.area,
    });

    setActiveIndex(0);
    setOpen(false);
  }

  /* ------------------------------------------------------------------------ */
  /* KEYBOARD NAVIGATION                                                      */
  /* ------------------------------------------------------------------------ */

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }

      setActiveIndex((current) =>
        Math.min(
          current + 1,
          Math.max(0, suggestions.length - 1),
        ),
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);

        setActiveIndex(
          Math.max(0, suggestions.length - 1),
        );

        return;
      }

      setActiveIndex((current) =>
        Math.max(0, current - 1),
      );

      return;
    }

    if (
      event.key === "Enter" &&
      open &&
      suggestions.length > 0
    ) {
      event.preventDefault();

      selectArea(
        suggestions[activeIndex] ?? suggestions[0],
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* KEEP ACTIVE OPTION VISIBLE                                               */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!open || suggestions.length === 0) return;

    optionRefs.current[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, open, suggestions.length]);

  /* ------------------------------------------------------------------------ */
  /* RENDER                                                                   */
  /* ------------------------------------------------------------------------ */

  let optionIndex = 0;

  return (
    <div
      ref={wrapperRef}
      className="relative z-40 min-w-0"
    >
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9087]"
          aria-hidden="true"
        />

        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && suggestions.length > 0
              ? `${id}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          value={value}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={100}
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white pl-9 pr-10 text-sm text-[#17202A] outline-none transition focus:border-[#FF9A81] focus:ring-2 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#FCFAF6]"
        />

        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={
            open
              ? "Close area suggestions"
              : "Open area suggestions"
          }
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#8A8077] transition hover:bg-[#FFF0E9] hover:text-[#9F2D18] disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </button>
      </div>

      {/* SUGGESTION DROPDOWN */}
      {open && !disabled && (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-label="Suggested areas grouped by state and local government area"
          className="absolute left-0 right-0 top-full z-[70] mt-2 max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-[#EAE6DF] bg-white p-2 shadow-[0_18px_45px_rgba(23,32,42,0.16)]"
        >
          <div className="sticky top-0 z-10 mb-1 flex items-center justify-between gap-2 bg-white px-2 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#91877E]">
              {value.trim()
                ? "Matching locations"
                : "Browse by state"}
            </span>

            <span className="text-[10px] font-semibold text-[#9F2D18]">
              {loading
                ? "Loading..."
                : `${suggestions.length} options`}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-3 py-5 text-xs text-[#756B61]">
              <Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" />
              Preparing location suggestions...
            </div>
          ) : loadError ? (
            <p
              role="status"
              className="px-3 py-4 text-xs leading-5 text-[#9F2D18]"
            >
              {loadError} You can still search with the text entered.
            </p>
          ) : suggestions.length === 0 ? (
            <p className="px-3 py-4 text-xs leading-5 text-[#756B61]">
              No matching predefined area. You can still search with
              &quot;{value.trim()}&quot;.
            </p>
          ) : (
            filteredGroups.map((stateGroup) => (
              <div
                key={stateGroup.state}
                className="mb-3 last:mb-0"
              >
                <p className="rounded-lg bg-[#FCFAF6] px-2 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9F2D18]">
                  {stateGroup.state} State
                </p>

                {stateGroup.groups.map((group) => (
                  <div
                    key={`${stateGroup.state}-${group.lga}`}
                    className="mb-2 last:mb-0"
                  >
                    <p className="px-2 pb-1 pt-2 text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#9A8E84]">
                      {group.lga} LGA
                    </p>

                    {group.areas.map((area) => {
                      const currentIndex = optionIndex++;

                      const active =
                        activeIndex === currentIndex;

                      const selected =
                        normalize(value) === normalize(area) &&
                        (!state ||
                          normalize(state) ===
                            normalize(stateGroup.state)) &&
                        (!lga ||
                          normalize(lga) ===
                            normalize(group.lga));

                      return (
                        <button
                          key={`${stateGroup.state}-${group.lga}-${area}`}
                          ref={(node) => {
                            optionRefs.current[currentIndex] = node;
                          }}
                          id={`${id}-option-${currentIndex}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() =>
                            setActiveIndex(currentIndex)
                          }
                          onClick={() =>
                            selectArea({
                              state: stateGroup.state,
                              lga: group.lga,
                              area,
                            })
                          }
                          className={`flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition ${
                            active
                              ? "bg-[#FFF1ED] font-semibold text-[#9F2D18]"
                              : "text-[#514840] hover:bg-[#FCFAF6]"
                          }`}
                        >
                          <span>{area}</span>

                          {selected && (
                            <span className="text-[9px] font-bold text-[#9F2D18]">
                              Selected
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
