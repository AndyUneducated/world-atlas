import clsx from "clsx";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { accentColor, pathLabel, wonderName } from "../lib/entity";
import { displayName, formatNumber, otherName, t, type StringKey } from "../lib/i18n";
import { SearchIndex } from "../lib/search";
import { ROAD_NETWORKS } from "../lib/style";
import { hasShield } from "../lib/shields";
import { RouteShield } from "./RouteShield";
import type { Entity } from "../lib/types";
import { useAtlas } from "../store";
import { Emblem, hasEmblem } from "./Emblem";
import { EntityIcon } from "./EntityIcon";

const ROAD_GROUPS = ["nationalExpressway", "territorialExpressway", "territorialHighway"] as const;
type RoadGroup = (typeof ROAD_GROUPS)[number];
type ExploreGroup = "cities" | "wonders" | RoadGroup | "railways";
const EXPLORE_GROUPS: ExploreGroup[] = ["cities", "wonders", ...ROAD_GROUPS, "railways"];
const EXPLORE_TITLES: Record<ExploreGroup, StringKey> = {
  cities: "exploreCities",
  wonders: "wonders",
  nationalExpressway: "nationalExpressway",
  territorialExpressway: "territorialExpressway",
  territorialHighway: "territorialHighway",
  railways: "railways",
};
const byRef = (a: Entity, b: Entity) => (a.ref ?? "").localeCompare(b.ref ?? "", "en", { numeric: true });
const KIND_ORDER = ["natural", "place", "route"];

function ExploreSection({ title, count, open, onToggle, children }: { title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="not-first:mt-1">
      <button
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase hover:bg-hover hover:text-muted"
      >
        <span className="flex-1 text-left">{title}</span>
        <span className="rounded-full bg-hover px-1.5 font-medium tabular-nums">{count}</span>
        <ChevronDown className={clsx("size-3.5 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden">
            <div className="pt-1 pb-1.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SearchBox() {
  const data = useAtlas((s) => s.data);
  const lang = useAtlas((s) => s.lang);
  const selectedId = useAtlas((s) => s.selectedId);
  const select = useAtlas((s) => s.select);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const [index, setIndex] = useState<SearchIndex | null>(null);
  useEffect(() => {
    if (data) SearchIndex.create(Object.values(data.entities)).then(setIndex);
  }, [data]);
  /** Territory the search and explore lists are limited to; null for every territory. */
  const [scope, setScope] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const territories = useMemo(() => (data ? data.manifest.regions.map((r) => data.entities[r.id]).filter(Boolean) : []), [data]);
  const inScope = useMemo(() => {
    const within = (e: Entity | undefined, s: string) => !!e && (e.id === s || !!e.ancestors?.includes(s) || !!e.territories?.includes(s));
    // railways carry no ancestors of their own: they belong where their stops are
    return (e: Entity) => !scope || within(e, scope) || (!e.ancestors && !!e.via?.some((v) => within(data?.entities[v], scope)));
  }, [scope, data]);
  const hits = useMemo(() => (index ? index.search(query, 8, inScope) : []), [index, query, inScope]);
  const cities = useMemo(() => {
    if (!data) return [];
    return territories.filter(inScope).flatMap((r) => r.children ?? []).map((id) => data.entities[id]).filter(Boolean);
  }, [data, territories, inScope]);
  const routes = useMemo(() => {
    const out: Record<RoadGroup | "railways", Entity[]> = { nationalExpressway: [], territorialExpressway: [], territorialHighway: [], railways: [] };
    if (!data) return out;
    for (const e of Object.values(data.entities)) {
      if (e.kind !== "route" || !e.bbox || !inScope(e)) continue;
      const g = e.network === "intercity_rail" ? "railways" : ROAD_GROUPS.find((k) => (ROAD_NETWORKS[k] as readonly string[]).includes(e.network ?? ""));
      if (g) out[g].push(e);
    }
    for (const g of ROAD_GROUPS) out[g].sort(byRef);
    out.railways.sort((a, b) => (b.stats?.length_km ?? 0) - (a.stats?.length_km ?? 0));
    return out;
  }, [data, inScope]);
  /** Wonders by territory (those between two territories last), then landforms, places and lines. */
  const wonders = useMemo(() => {
    if (!data) return [];
    const ids = territories.map((r) => r.id);
    const home = (e: Entity) => {
      const own = ids.filter((id) => e.ancestors?.includes(id) || e.territories?.includes(id) || e.via?.some((v) => data.entities[v]?.ancestors?.includes(id)));
      return own.length === 1 ? ids.indexOf(own[0]) : ids.length;
    };
    const rank = (e: Entity) => home(e) * 10 + KIND_ORDER.indexOf(e.kind);
    return Object.values(data.entities)
      .filter((e) => e.wonder && e.bbox && inScope(e))
      .sort((a, b) => rank(a) - rank(b));
  }, [data, territories, inScope]);
  const [expanded, setExpanded] = useState<Record<ExploreGroup, boolean>>({
    cities: false,
    wonders: false,
    nationalExpressway: false,
    territorialExpressway: false,
    territorialHighway: false,
    railways: false,
  });
  const selected = selectedId && data ? data.entities[selectedId] : undefined;

  useEffect(() => {
    setQuery(selected ? displayName(selected, lang) : "");
  }, [selected, lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scopeBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scopeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!scopeBox.current?.contains(e.target as Node)) setScopeOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [scopeOpen]);

  const choose = (id: string) => {
    select(id);
    setOpen(false);
    input.current?.blur();
  };

  const showResults = open && query.trim() !== "" && (!selected || query !== displayName(selected, lang));
  const showExplore = open && !showResults;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && showResults && hits[cursor]) {
      choose(hits[cursor].entity.id);
    } else if (e.key === "Escape") {
      setOpen(false);
      input.current?.blur();
    }
  };

  const scopeEntity = scope && data ? data.entities[scope] : undefined;
  const territoryLabel = (e: Entity) => e.short_names?.[lang] ?? displayName(e, lang);

  return (
    <div className="pointer-events-auto relative">
      <div className={clsx("glass flex h-12 items-center gap-2 rounded-2xl pr-4 pl-1.5 transition-shadow", open && "ring-2 ring-accent/40")}>
        <div ref={scopeBox} className="relative shrink-0">
          <button
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => setScopeOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            aria-label={t("territoryScope", lang)}
            className={clsx(
              "flex h-9 max-w-[9.5rem] items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium transition-colors",
              scope ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {scopeEntity && hasEmblem(scopeEntity) ? <Emblem entity={scopeEntity} size={16} className="shrink-0" /> : <Search className="size-4 shrink-0" strokeWidth={2} />}
            <span className="truncate">{scopeEntity ? territoryLabel(scopeEntity) : t("allTerritories", lang)}</span>
            <ChevronDown className={clsx("size-3.5 shrink-0 transition-transform duration-200", scopeOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {scopeOpen && (
              <motion.ul
                role="listbox"
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="glass absolute top-11 left-0 z-30 min-w-48 origin-top-left rounded-xl p-1"
              >
                {[null, ...territories].map((e) => {
                  const id = e?.id ?? null;
                  return (
                    <li key={id ?? "all"} role="option" aria-selected={scope === id}>
                      <button
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => {
                          setScope(id);
                          setScopeOpen(false);
                          setCursor(0);
                          setOpen(true);
                          input.current?.focus();
                        }}
                        className={clsx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-hover", scope === id && "font-medium")}
                      >
                        <span className="grid size-5 shrink-0 place-items-center">
                          {e && hasEmblem(e) ? <Emblem entity={e} size={20} /> : <Search className="size-4 text-muted" strokeWidth={2} />}
                        </span>
                        <span className="flex-1 truncate">{e ? territoryLabel(e) : t("allTerritories", lang)}</span>
                        {scope === id && <Check className="size-3.5 shrink-0 text-accent" strokeWidth={3} />}
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
        <span className="h-5 w-px shrink-0 bg-line" />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder", lang)}
          aria-label={t("searchPlaceholder", lang)}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery("");
              select(null);
              input.current?.focus();
            }}
            className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover"
            aria-label={t("close", lang)}
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-sans text-[11px] text-faint sm:block">Ctrl K</kbd>
        )}
      </div>

      <AnimatePresence>
        {(showResults || showExplore) && data && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="glass scrollbar-thin absolute inset-x-0 top-14 z-20 max-h-[min(70dvh,560px)] overflow-y-auto rounded-2xl p-1.5"
          >
            {showResults &&
              (hits.length ? (
                <ul role="listbox">
                  {hits.map((h, i) => {
                    const e = h.entity;
                    const accent = accentColor(data, e);
                    return (
                      <li key={e.id} role="option" aria-selected={i === cursor}>
                        <button
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => choose(e.id)}
                          onMouseEnter={() => setCursor(i)}
                          className={clsx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", i === cursor && "bg-hover")}
                        >
                          {hasEmblem(e) ? (
                            <span className="grid size-9 shrink-0 place-items-center">
                              <Emblem entity={e} size={32} />
                            </span>
                          ) : (
                            <span
                              className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
                              style={accent ? { background: `${accent}22`, color: accent } : undefined}
                            >
                              <EntityIcon entity={e} className="size-[18px]" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="truncate text-[14px] font-medium text-ink">{displayName(e, lang)}</span>
                              <span className="truncate text-[12px] text-faint">{otherName(e, lang)}</span>
                            </span>
                            <span className="block truncate text-[12px] text-muted">{pathLabel(data, e, lang)}</span>
                          </span>
                          {e.ref &&
                            (hasShield(e) ? (
                              <RouteShield entity={e} height={20} />
                            ) : (
                              <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted">{e.ref}</span>
                            ))}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-3 py-4 text-center text-[13px] text-muted">{t("noResults", lang)}</p>
              ))}
            {showExplore && (
              <div className="p-1">
                {EXPLORE_GROUPS.map((g) => {
                  const items = g === "cities" ? cities : g === "wonders" ? wonders : routes[g];
                  if (!items.length) return null;
                  return (
                    <ExploreSection key={g} title={t(EXPLORE_TITLES[g], lang)} count={items.length} open={expanded[g]} onToggle={() => setExpanded((x) => ({ ...x, [g]: !x[g] }))}>
                      <div className={clsx("grid gap-1", g === "cities" ? "grid-cols-2" : "grid-cols-1")}>
                        {items.map((e) => {
                          const accent = accentColor(data, e);
                          return (
                            <button
                              key={e.id}
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => choose(e.id)}
                              className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover"
                            >
                              {g === "cities" ? (
                                <Emblem entity={e} size={20} className="shrink-0" />
                              ) : g === "wonders" ? (
                                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-500">
                                  <EntityIcon entity={e} className="size-3.5" />
                                </span>
                              ) : g === "railways" ? (
                                <span className="flex w-9 shrink-0 justify-center">
                                  <span className="h-1.5 w-6 rounded-full" style={{ background: accent }} />
                                </span>
                              ) : (
                                <span className="flex w-9 shrink-0 justify-center">
                                  <RouteShield entity={e} height={g === "nationalExpressway" ? 20 : 22} />
                                </span>
                              )}
                              {g === "wonders" ? (
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{wonderName(e, lang)}</span>
                                  <span className="block truncate text-[11.5px] text-faint">{e.wonder![lang]}</span>
                                </span>
                              ) : (
                                <span className="truncate">{displayName(e, lang)}</span>
                              )}
                              {g !== "cities" && g !== "wonders" && e.stats?.length_km ? (
                                <span className="ml-auto shrink-0 text-[11.5px] text-faint tabular-nums">{formatNumber(e.stats.length_km, lang, 0)} km</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </ExploreSection>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
