import clsx from "clsx";
import { ChevronDown, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { accentColor, pathLabel } from "../lib/entity";
import { displayName, formatNumber, otherName, t, type StringKey } from "../lib/i18n";
import { SearchIndex } from "../lib/search";
import type { Entity } from "../lib/types";
import { useAtlas } from "../store";
import { Emblem, hasEmblem } from "./Emblem";
import { EntityIcon } from "./EntityIcon";

type ExploreGroup = "cities" | "national" | "territorial";
const EXPLORE_TITLES: Record<ExploreGroup, StringKey> = { cities: "exploreCities", national: "exploreNational", territorial: "exploreTerritorial" };
const byRef = (a: Entity, b: Entity) => (a.ref ?? "").localeCompare(b.ref ?? "", "en", { numeric: true });

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
  const hits = useMemo(() => (index ? index.search(query) : []), [index, query]);
  const cities = useMemo(() => {
    if (!data) return [];
    const home = data.entities[data.manifest.home];
    return (home?.children ?? []).map((id) => data.entities[id]).filter(Boolean);
  }, [data]);
  const routes = useMemo(() => {
    const out: Record<"national" | "territorial", Entity[]> = { national: [], territorial: [] };
    if (!data) return out;
    for (const e of Object.values(data.entities)) {
      if (e.kind !== "route" || !e.bbox) continue;
      if (e.network?.startsWith("national_")) out.national.push(e);
      else if (e.network?.startsWith("territorial_")) out.territorial.push(e);
    }
    out.national.sort(byRef);
    out.territorial.sort(byRef);
    return out;
  }, [data]);
  const [expanded, setExpanded] = useState<Record<ExploreGroup, boolean>>({ cities: true, national: false, territorial: false });
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

  return (
    <div className="pointer-events-auto relative">
      <div className={clsx("glass flex h-12 items-center gap-3 rounded-2xl px-4 transition-shadow", open && "ring-2 ring-accent/40")}>
        <Search className="size-[18px] shrink-0 text-muted" strokeWidth={2} />
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
                          {e.ref && <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted">{e.ref}</span>}
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
                {(["cities", "national", "territorial"] as const).map((g) => {
                  const items = g === "cities" ? cities : routes[g];
                  if (!items.length) return null;
                  return (
                    <ExploreSection key={g} title={t(EXPLORE_TITLES[g], lang)} count={items.length} open={expanded[g]} onToggle={() => setExpanded((x) => ({ ...x, [g]: !x[g] }))}>
                      <div className={clsx("grid gap-1", g === "cities" ? "grid-cols-2" : "grid-cols-1")}>
                        {items.map((e) => (
                          <button
                            key={e.id}
                            onMouseDown={(ev) => ev.preventDefault()}
                            onClick={() => choose(e.id)}
                            className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover"
                          >
                            {g === "cities" ? (
                              <Emblem entity={e} size={20} className="shrink-0" />
                            ) : (
                              <span className="w-[68px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold text-white tabular-nums" style={{ background: accentColor(data, e) }}>
                                {e.ref}
                              </span>
                            )}
                            <span className="truncate">{displayName(e, lang)}</span>
                            {g !== "cities" && e.stats?.length_km ? (
                              <span className="ml-auto shrink-0 text-[11.5px] text-faint tabular-nums">{formatNumber(e.stats.length_km, lang, 0)} km</span>
                            ) : null}
                          </button>
                        ))}
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
