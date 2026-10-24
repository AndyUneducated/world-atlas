import clsx from "clsx";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { accentColor, pathLabel } from "../lib/entity";
import { displayName, otherName, t } from "../lib/i18n";
import { SearchIndex } from "../lib/search";
import { useAtlas } from "../store";
import { Emblem, hasEmblem } from "./Emblem";
import { EntityIcon } from "./EntityIcon";

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
            className="glass absolute inset-x-0 top-14 z-20 overflow-hidden rounded-2xl p-1.5"
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
              <div className="p-2">
                <p className="mb-2 px-1 text-[11px] font-medium tracking-wider text-faint uppercase">{t("explore", lang)}</p>
                <div className="grid grid-cols-2 gap-1">
                  {cities.map((c) => (
                    <button
                      key={c.id}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => choose(c.id)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover"
                    >
                      <Emblem entity={c} size={20} className="shrink-0" />
                      <span className="truncate">{displayName(c, lang)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
