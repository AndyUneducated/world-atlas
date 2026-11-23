import clsx from "clsx";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { accentColor, holdsNoLand, islandStates, isRegistryCountry, pathLabel, wonderName } from "../lib/entity";
import { displayName, formatNumber, kindLabel, otherName, shortName, t, type StringKey } from "../lib/i18n";
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
type RailGroup = "rail" | "maglevs";
type ExploreGroup = "nations" | "blocs" | "cities" | "wonders" | "parties" | "roads" | "transit" | "mountains" | "waters" | "airports" | "military";
const EXPLORE_GROUPS: ExploreGroup[] = ["nations", "blocs", "cities", "wonders", "parties", "roads", "transit", "mountains", "waters", "airports", "military"];
const EXPLORE_TITLES: Record<ExploreGroup, StringKey> = {
  nations: "exploreNations",
  blocs: "exploreBlocs",
  cities: "exploreCities",
  wonders: "wonders",
  parties: "parties",
  roads: "exploreRoads",
  transit: "exploreTransit",
  mountains: "exploreMountains",
  waters: "exploreWaters",
  airports: "exploreAirports",
  military: "exploreMilitary",
};
/** The military sites the explore list shows: bases and missile sites, not every armoury and checkpoint. */
const MILITARY_SUBTYPES = new Set(["military_base", "air_base", "naval_base", "missile_site"]);
/** A row of an explore list: an entity with the figure shown at its right. */
type ExploreRow = { e: Entity; right?: string };
/** A part of an explore group: a subgroup that folds on its own (`title`), or the group's rows themselves (no title). */
type ExploreSub = { key: string; title?: string; rows: ExploreRow[] };
/** Where the arrow keys stop in the explore list. Groups and subgroups fold under one key: the group's, or `group:sub`. */
type ExploreStop = { kind: "fold"; key: string } | { kind: "item"; key: string; id: string };
const byRef = (a: Entity, b: Entity) => (a.ref ?? "").localeCompare(b.ref ?? "", "en", { numeric: true });
const KIND_ORDER = ["natural", "place", "route"];

/** A folding part of the explore list: a group (capitals), or a subgroup within one (`sub`, smaller and indented). */
function ExploreSection({ title, count, open, active, sub, onToggle, children }: { title: string; count: number; open: boolean; active?: boolean; sub?: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={sub ? undefined : "not-first:mt-1"}>
      <button
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={onToggle}
        aria-expanded={open}
        data-explore={active ? "active" : undefined}
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg px-2 text-faint hover:bg-hover hover:text-muted",
          sub ? "py-1 pl-4 text-[12px] font-medium" : "py-1.5 text-[11px] font-semibold tracking-wider uppercase",
          active && "bg-hover text-muted",
        )}
      >
        <span className="flex-1 text-left">{title}</span>
        <span className="rounded-full bg-hover px-1.5 text-[11px] font-medium tabular-nums">{count}</span>
        <ChevronDown className={clsx("size-3.5 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="overflow-hidden">
            <div className={sub ? "pt-0.5 pb-1" : "pt-1 pb-1.5"}>{children}</div>
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
    if (data) SearchIndex.create(Object.values(data.entities)).then(setIndex, (err) => console.error("Search index failed to load", err));
  }, [data]);
  /** Territory the search and explore lists are limited to; null for every territory. */
  const [scope, setScope] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const territories = useMemo(() => (data ? data.manifest.regions.map((r) => data.entities[r.id]).filter(Boolean) : []), [data]);
  /** The states holding land on Ranova, by ISO number. */
  const island = useMemo(() => (data ? islandStates(data) : []), [data]);
  /** China and the United States, then the states on Ranova (the government in exile first): the scope
   * choices, each country followed by its territories. */
  const nations = useMemo(() => {
    if (!data) return [];
    const countries = Object.values(data.entities).filter((e) => e.subtype === "country" && e.bbox && isRegistryCountry(e));
    const landless = Object.values(data.entities).filter((e) => e.subtype === "country" && e.bbox && holdsNoLand(e));
    return [...countries, ...landless, ...island];
  }, [data, island]);
  const scopes = useMemo(() => {
    const out: { e: Entity; depth: number }[] = [];
    for (const n of nations) {
      out.push({ e: n, depth: 0 });
      for (const r of territories.filter((r) => r.ancestors?.includes(n.id))) out.push({ e: r, depth: 1 });
    }
    return out;
  }, [nations, territories]);
  const inScope = useMemo(() => {
    const under = (e?: Entity) => !!e && !!scope && (e.id === scope || !!e.ancestors?.includes(scope));
    return (e: Entity) =>
      !scope || under(e) || !!e.territories?.some((id) => under(data?.entities[id])) || !!e.via?.some((id) => under(data?.entities[id]));
  }, [scope, data]);
  const hits = useMemo(() => (index ? index.search(query, 8, inScope) : []), [index, query, inScope]);
  /** Cities: a territory's children, then those of the states on Ranova. */
  const cities = useMemo(() => {
    if (!data) return [];
    return [...territories.filter((r) => r.subtype === "dependency"), ...island]
      .flatMap((r) => r.children ?? [])
      .map((id) => data.entities[id])
      .filter((e) => e && inScope(e));
  }, [data, territories, island, inScope]);
  /** Countries, each followed by its territories (China's territories, California). */
  const nationList = useMemo(() => scopes.map((x) => x.e).filter(inScope), [scopes, inScope]);
  const routes = useMemo(() => {
    const out: Record<RoadGroup | RailGroup, Entity[]> = { nationalExpressway: [], territorialExpressway: [], territorialHighway: [], rail: [], maglevs: [] };
    if (!data) return out;
    for (const e of Object.values(data.entities)) {
      if (e.kind !== "route" || !e.bbox || !inScope(e)) continue;
      // railways split by technology: wheeled lines (conventional and high-speed), and maglevs (open-air and
      // vacuum, the vacuum heavy-haul lines too; the wheeled heavy-haul lines are railways)
      const rail = e.network === "intercity_rail" || e.network === "freight_rail";
      const g = rail ? (e.maglev || (e.network === "freight_rail" && !e.conventional) ? "maglevs" : "rail") : ROAD_GROUPS.find((k) => (ROAD_NETWORKS[k] as readonly string[]).includes(e.network ?? ""));
      if (g) out[g].push(e);
    }
    for (const g of ROAD_GROUPS) out[g].sort(byRef);
    for (const g of ["rail", "maglevs"] as const) out[g].sort((a, b) => (b.stats?.length_km ?? 0) - (a.stats?.length_km ?? 0));
    return out;
  }, [data, inScope]);
  /** Wonders by territory (those between two territories last), then landforms, places and lines. */
  const wonders = useMemo(() => {
    if (!data) return [];
    // a generated region is a territory, or Ranova with every state on it
    const islandIds = new Set(island.map((s) => s.id));
    const owns = (r: Entity, id: string) => id === r.id || (r.subtype !== "dependency" && islandIds.has(id));
    const home = (e: Entity) => {
      const own = territories.filter(
        (r) => e.ancestors?.some((a) => owns(r, a)) || e.territories?.some((a) => owns(r, a)) || e.via?.some((v) => data.entities[v]?.ancestors?.some((a) => owns(r, a))),
      );
      return own.length === 1 ? territories.indexOf(own[0]) : territories.length;
    };
    const rank = (e: Entity) => home(e) * 10 + KIND_ORDER.indexOf(e.kind);
    return Object.values(data.entities)
      .filter((e) => e.wonder && e.bbox && inScope(e))
      .sort((a, b) => rank(a) - rank(b));
  }, [data, territories, island, inScope]);
  /** Parties standing in the scope, most seats in its parliaments first, then in every parliament. */
  const partyList = useMemo(() => {
    if (!data) return [];
    const parliament = (id: string) => {
      const at = data.entities[id];
      return at?.subtype === "dependency" || at?.subtype === "country";
    };
    const seats = (e: Entity, scoped: boolean) =>
      (e.seats ?? [])
        .filter((s) => parliament(s.at) && (!scoped || inScope(data.entities[s.at])))
        .reduce((a, s) => a + s.seats, 0);
    return Object.values(data.entities)
      .filter((e) => e.kind === "party" && inScope(e))
      .map((e) => ({ e, seats: seats(e, true), total: seats(e, false) }))
      .sort((a, b) => b.seats - a.seats || (b.e.members ?? 0) - (a.e.members ?? 0) || b.total - a.total);
  }, [data, inScope]);
  /** Every group's parts: subgroups that fold on their own where a group mixes kinds or places, else its rows. */
  const exploreParts = useMemo(() => {
    const parts = {} as Record<ExploreGroup, ExploreSub[]>;
    if (!data) return parts;
    const all = Object.values(data.entities).filter((e) => e.bbox && inScope(e));
    const km = (v?: number) => (v ? `${formatNumber(v, lang, 0)} km` : undefined);
    const m = (v?: number) => (v ? `${formatNumber(v, lang, 0)} m` : undefined);
    const flat = (rows: ExploreRow[]): ExploreSub[] => [{ key: "", rows }];
    const sub = (key: string, title: string, list: Entity[], right?: (e: Entity) => string | undefined): ExploreSub[] =>
      list.length ? [{ key, title, rows: list.map((e) => ({ e, right: right?.(e) })) }] : [];
    const length = (e: Entity) => km(e.stats?.length_km);
    const depth = new Map(scopes.map((x) => [x.e.id, x.depth]));
    parts.nations = [
      ...sub("countries", t("exploreCountries", lang), nationList.filter((e) => !depth.get(e.id))),
      ...sub("territories", t("exploreTerritories", lang), nationList.filter((e) => depth.get(e.id))),
    ];
    parts.cities = flat(cities.map((e) => ({ e })));
    parts.wonders = flat(wonders.map((e) => ({ e })));
    parts.parties = flat(partyList.map((p) => ({ e: p.e, right: `${p.seats} ${t("seatsUnit", lang)}` })));
    parts.roads = ROAD_GROUPS.flatMap((g) => sub(g, t(g, lang), routes[g], length));
    // blocs: those with a member in the scope
    parts.blocs = flat(
      Object.values(data.entities)
        .filter((e) => e.kind === "bloc" && (!scope || e.member_nations?.some((id) => inScope(data.entities[id]))))
        .sort((a, b) => (b.member_nations?.length ?? 0) - (a.member_nations?.length ?? 0))
        .map((e) => ({ e, right: t("blocMembers", lang).replace("{n}", String(e.member_nations?.length ?? 0)) })),
    );
    // metro lines by their cities, in the order of the city list, then by line number
    const cityAt = new Map(cities.map((c, i) => [c.id, i]));
    const lineNo = (e: Entity) => Number(/(\d+)/.exec(e.names.zh)?.[1] ?? 0);
    const cityOf = (e: Entity) => e.ancestors?.find((a) => cityAt.has(a));
    const metro = all
      .filter((e) => e.kind === "route" && e.network === "metro")
      .sort((a, b) => (cityAt.get(cityOf(a) ?? "") ?? 1e9) - (cityAt.get(cityOf(b) ?? "") ?? 1e9) || lineNo(a) - lineNo(b));
    parts.transit = [
      ...sub("rail", t("exploreRail", lang), routes.rail, length),
      ...sub("maglevs", t("exploreMaglev", lang), routes.maglevs, length),
      ...sub("metro", t("exploreMetro", lang), metro, length),
    ];
    const of = (subtype: string) => all.filter((e) => e.subtype === subtype);
    parts.mountains = [
      ...sub("ranges", t("ranges", lang), of("mountain_range").sort((a, b) => (b.stats?.elev_max_m ?? 0) - (a.stats?.elev_max_m ?? 0)), (e) => m(e.stats?.elev_max_m)),
      ...sub("peaks", t("peaks", lang), of("peak").sort((a, b) => (b.stats?.elevation_m ?? 0) - (a.stats?.elevation_m ?? 0)), (e) => m(e.stats?.elevation_m)),
    ];
    parts.waters = [
      ...sub("rivers", t("rivers", lang), of("river").sort((a, b) => (b.stats?.length_km ?? 0) - (a.stats?.length_km ?? 0)), length),
      ...sub("lakes", t("lakes", lang), of("lake").sort((a, b) => (b.stats?.area_km2_mapped ?? 0) - (a.stats?.area_km2_mapped ?? 0)),
        (e) => (e.stats?.area_km2_mapped ? `${formatNumber(e.stats.area_km2_mapped, lang, 0)} km²` : undefined)),
    ];
    // airports and military sites under the territory or state they are in, in the order of the nations list
    const regionAt = new Map(nationList.map((n, i) => [n.id, i]));
    const regionOf = (e: Entity) => e.ancestors?.find((a) => regionAt.has(a));
    const byRegion = (list: Entity[], right: (e: Entity) => string | undefined): ExploreSub[] => {
      const groups = new Map<string, Entity[]>();
      for (const e of list) {
        const r = regionOf(e) ?? "";
        groups.set(r, [...(groups.get(r) ?? []), e]);
      }
      return [...groups.entries()]
        .sort(([a], [b]) => (regionAt.get(a) ?? 1e9) - (regionAt.get(b) ?? 1e9))
        .flatMap(([r, es]) => sub(r || "other", r && data.entities[r] ? displayName(data.entities[r], lang) : t("otherPlaces", lang), es, right));
    };
    const cityName = (e: Entity) => {
      const c = e.ancestors?.map((a) => data.entities[a]).find((a) => a?.subtype === "locality");
      return c ? displayName(c, lang) : undefined;
    };
    parts.airports = byRegion(of("airport").sort((a, b) => displayName(a, "zh").localeCompare(displayName(b, "zh"), "zh")), cityName);
    parts.military = byRegion(
      all.filter((e) => MILITARY_SUBTYPES.has(e.subtype ?? "")).sort((a, b) => (a.subtype ?? "").localeCompare(b.subtype ?? "") || displayName(a, "zh").localeCompare(displayName(b, "zh"), "zh")),
      (e) => kindLabel(e, lang),
    );
    return parts;
  }, [data, inScope, scope, lang, scopes, nationList, cities, wonders, partyList, routes]);
  /** Which groups and subgroups are open, by key (`group`, or `group:sub`); every one starts folded. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string, open?: boolean) => setExpanded((x) => ({ ...x, [key]: open ?? !x[key] }));
  /** Where the arrow keys stop in the explore list: a group's or subgroup's heading, or an item of an open one. */
  const exploreStops = useMemo(() => {
    const out: ExploreStop[] = [];
    for (const g of EXPLORE_GROUPS) {
      const parts = exploreParts[g] ?? [];
      if (!parts.some((p) => p.rows.length)) continue;
      out.push({ kind: "fold", key: g });
      if (!expanded[g]) continue;
      for (const p of parts) {
        const key = p.title ? `${g}:${p.key}` : g;
        if (p.title) out.push({ kind: "fold", key });
        if (expanded[key]) for (const r of p.rows) out.push({ kind: "item", key, id: r.e.id });
      }
    }
    return out;
  }, [exploreParts, expanded]);
  const [exploreAt, setExploreAt] = useState(-1);
  const exploreFocus = exploreAt >= 0 ? exploreStops[exploreAt] : undefined;
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

  const showResults = open && query.trim() !== "" && (!selected || query !== displayName(selected, lang));
  const showExplore = open && !showResults;
  const setSearchOpen = useAtlas((s) => s.setSearchOpen);
  const panelShown = (showResults || showExplore) && !!data;
  useEffect(() => setSearchOpen(panelShown), [panelShown, setSearchOpen]);

  const panel = useRef<HTMLDivElement>(null);
  const choose = (id: string) => {
    select(id, { list: { query: showResults ? query : "", scope, expanded, scroll: panel.current?.scrollTop ?? 0 } });
    setOpen(false);
    input.current?.blur();
  };

  const restoreList = useAtlas((s) => s.restoreList);
  const setRestoreList = useAtlas((s) => s.setRestoreList);
  const pendingScroll = useRef<number | null>(null);
  // declared after the effect that shows the selection's name, so a restored query wins over it
  useEffect(() => {
    if (!restoreList) return;
    setScope(restoreList.scope);
    setExpanded((x) => ({ ...x, ...restoreList.expanded }));
    setQuery(restoreList.query || (selected ? displayName(selected, lang) : ""));
    setCursor(0);
    setOpen(true);
    pendingScroll.current = restoreList.scroll;
    setRestoreList(null);
    input.current?.focus({ preventScroll: true });
  }, [restoreList]);
  useEffect(() => {
    if (pendingScroll.current === null || !panel.current) return;
    panel.current.scrollTop = pendingScroll.current;
    pendingScroll.current = null;
  });

  useEffect(() => setExploreAt(-1), [showExplore, scope]);
  useEffect(() => {
    if (exploreAt >= 0) panel.current?.querySelector('[data-explore="active"]')?.scrollIntoView({ block: "nearest" });
  }, [exploreAt, expanded]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showExplore && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setExploreAt((i) => (e.key === "ArrowDown" ? Math.min(i + 1, exploreStops.length - 1) : Math.max(i - 1, -1)));
      return;
    }
    if (showExplore && exploreFocus?.kind === "fold" && (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      toggle(exploreFocus.key, e.key === "Enter" ? undefined : e.key === "ArrowRight");
      return;
    }
    if (showExplore && exploreFocus?.kind === "item" && e.key === "Enter") {
      e.preventDefault();
      choose(exploreFocus.id);
      return;
    }
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
            <span className="truncate">{scopeEntity ? shortName(scopeEntity, lang) : t("allTerritories", lang)}</span>
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
                className="glass scrollbar-thin absolute top-11 left-0 z-30 max-h-[min(60dvh,480px)] min-w-52 origin-top-left overflow-y-auto rounded-xl p-1"
              >
                {[{ e: null, depth: 0 }, ...scopes].map(({ e, depth }) => {
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
                        className={clsx(
                          "flex w-full items-center gap-2.5 rounded-lg py-2 pr-2.5 text-left text-[13px] text-ink hover:bg-hover",
                          depth ? "pl-7" : "pl-2.5",
                          scope === id && "font-medium",
                        )}
                      >
                        <span className="grid size-5 shrink-0 place-items-center">
                          {e && hasEmblem(e) ? <Emblem entity={e} size={20} /> : <Search className="size-4 text-muted" strokeWidth={2} />}
                        </span>
                        <span className="flex-1 truncate">{e ? shortName(e, lang) : t("allTerritories", lang)}</span>
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
            ref={panel}
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
                            <span className="block truncate text-[12px] text-muted">{pathLabel(data, e, lang) || kindLabel(e, lang)}</span>
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
              <div className="card-text p-1">
                {EXPLORE_GROUPS.map((g) => {
                  const parts = exploreParts[g] ?? [];
                  const count = parts.reduce((n, p) => n + p.rows.length, 0);
                  if (!count) return null;
                  const list = (key: string, rows: ExploreRow[]) => (
                    <div className={clsx("grid gap-1", g === "cities" || g === "nations" ? "grid-cols-2" : "grid-cols-1")}>
                      {rows.map((r) => {
                        const e = r.e;
                        const accent = accentColor(data, e);
                        // a nation's cities fly the nation's flag
                        const flagOf = hasEmblem(e) ? e : (data.entities[e.parent ?? ""] ?? e);
                        const active = exploreFocus?.kind === "item" && exploreFocus.key === key && exploreFocus.id === e.id;
                        return (
                          <button
                            key={e.id}
                            data-explore={active ? "active" : undefined}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => choose(e.id)}
                            className={clsx("flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover", active && "bg-hover")}
                          >
                            {g === "nations" || g === "cities" || g === "parties" ? (
                              <Emblem entity={flagOf} size={20} className="shrink-0" />
                            ) : g === "wonders" ? (
                              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-500">
                                <EntityIcon entity={e} className="size-3.5" />
                              </span>
                            ) : g === "blocs" ? (
                              <span
                                className="grid size-7 shrink-0 place-items-center rounded-lg"
                                style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}
                              >
                                <EntityIcon entity={e} className="size-3.5" />
                              </span>
                            ) : g === "transit" ? (
                              <span className="flex w-9 shrink-0 justify-center">
                                <span className="h-1.5 w-6 rounded-full" style={{ background: accent }} />
                              </span>
                            ) : g === "mountains" || g === "waters" || g === "airports" || g === "military" ? (
                              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-hover text-muted">
                                <EntityIcon entity={e} className="size-3.5" />
                              </span>
                            ) : (
                              <span className="flex w-9 shrink-0 justify-center">
                                <RouteShield entity={e} height={key === "roads:nationalExpressway" ? 20 : 22} />
                              </span>
                            )}
                            {g === "wonders" ? (
                              <span className="min-w-0 flex-1 leading-snug">
                                <span className="block">{wonderName(e, lang)}</span>
                                <span className="block text-[11.5px] text-faint">{e.wonder![lang]}</span>
                              </span>
                            ) : (
                              <span className="min-w-0 flex-1 leading-snug">{displayName(e, lang)}</span>
                            )}
                            {r.right ? <span className="ml-auto shrink-0 text-[11.5px] text-faint tabular-nums">{r.right}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                  const fold = (key: string, title: string, n: number, body: React.ReactNode, sub?: boolean) => (
                    <ExploreSection
                      key={key}
                      title={title}
                      count={n}
                      sub={sub}
                      open={!!expanded[key]}
                      active={exploreFocus?.kind === "fold" && exploreFocus.key === key}
                      onToggle={() => toggle(key)}
                    >
                      {body}
                    </ExploreSection>
                  );
                  return fold(
                    g,
                    t(EXPLORE_TITLES[g], lang),
                    count,
                    parts.map((p) => (p.title ? fold(`${g}:${p.key}`, p.title, p.rows.length, list(`${g}:${p.key}`, p.rows), true) : <div key="rows">{list(g, p.rows)}</div>)),
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
