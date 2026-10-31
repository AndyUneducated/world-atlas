import clsx from "clsx";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { displayName, formatNumber, t } from "../lib/i18n";
import { governmentSeats, isChamber, majority, SYSTEM_NAMES, systemText } from "../lib/politics";
import type { AtlasData, Chamber, Entity, Lang } from "../lib/types";
import { useAtlas } from "../store";
import { Paragraphs, Rows, Section, Sub } from "./CardParts";
import { Emblem, hasEmblem } from "./Emblem";
import { Hemicycle } from "./Hemicycle";

const COUNCILS_SHOWN = 6;
/** Parties with no seat are listed one by one from this share of the vote (%); the rest share a line. */
const MINOR_VOTE = 3;
const shortName = (p: Entity, lang: Lang) => p.short_names?.[lang] ?? displayName(p, lang);
const pct = (v: number, lang: Lang) => `${formatNumber(v, lang, 1)}%`;

function PartyChip({ party, lang }: { party: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  return (
    <button
      onClick={() => select(party.id)}
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-[12px] text-ink transition-colors hover:bg-hover"
      style={{ borderColor: `color-mix(in srgb, ${party.color} 40%, transparent)`, background: `color-mix(in srgb, ${party.color} 10%, transparent)` }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: party.color }} />
      {shortName(party, lang)}
    </button>
  );
}

function Tag({ tone, children }: { tone: "gov" | "mayor"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-1.5 py-px text-[10px] leading-tight font-semibold",
        tone === "gov" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-400/15 text-amber-500",
      )}
    >
      {children}
    </span>
  );
}

/** The hemicycle and, under it, every party in the chamber; hovering a party lights its seats. */
function ChamberView({ data, chamber, lang, note }: { data: AtlasData; chamber: Chamber; lang: Lang; note?: (id: string) => string | null }) {
  const select = useAtlas((s) => s.select);
  const [hover, setHover] = useState<string | null>(null);
  const listed = chamber.parties.filter((p) => p.seats || p.vote >= MINOR_VOTE);
  const rest = chamber.parties.filter((p) => !p.seats && p.vote < MINOR_VOTE);
  return (
    <>
      <div className="-mx-1">
        <Hemicycle data={data} chamber={chamber} lang={lang} highlight={hover} />
      </div>
      <div className="mt-2 grid grid-cols-[1fr_3.5rem_2rem] gap-2 px-2 text-[10.5px] text-faint">
        <span />
        <span className="text-right">{t("voteShare", lang)}</span>
        <span className="text-right">{t("seatsUnit", lang)}</span>
      </div>
      <ul className="-mx-2" onMouseLeave={() => setHover(null)}>
        {listed.map((p) => {
          const party = data.entities[p.id];
          if (!party) return null;
          const extra = note?.(p.id);
          return (
            <li key={p.id}>
              <button
                onClick={() => select(p.id)}
                onMouseEnter={() => setHover(p.seats ? p.id : null)}
                className={clsx("grid w-full grid-cols-[1fr_3.5rem_2rem] items-center gap-2 rounded-lg px-2 py-[5px] text-left text-[12.5px] hover:bg-hover", !p.seats && "opacity-55")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: party.color }} />
                  <span className="truncate text-ink">{displayName(party, lang)}</span>
                  {chamber.government.includes(p.id) && <Tag tone="gov">{t("government", lang)}</Tag>}
                  {extra && <span className="shrink-0 truncate text-[11px] text-faint">{extra}</span>}
                </span>
                <span className="text-right text-muted tabular-nums">{pct(p.vote, lang)}</span>
                <span className="text-right font-semibold text-ink tabular-nums">{p.seats}</span>
              </button>
            </li>
          );
        })}
        {rest.length > 0 && (
          <li
            className="grid grid-cols-[1fr_3.5rem_2rem] items-center gap-2 px-2 py-[5px] text-[12px] text-faint"
            title={rest.map((p) => data.entities[p.id] && shortName(data.entities[p.id], lang)).join(lang === "zh" ? "、" : ", ")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex shrink-0 -space-x-1">
                {rest.slice(0, 4).map((p) => (
                  <span key={p.id} className="size-2.5 rounded-full ring-1 ring-white/70" style={{ background: data.entities[p.id]?.color }} />
                ))}
              </span>
              <span className="truncate">{`${t("otherParties", lang)} · ${rest.length}`}</span>
            </span>
            <span className="text-right tabular-nums">{pct(rest.reduce((a, p) => a + p.vote, 0), lang)}</span>
            <span className="text-right tabular-nums">0</span>
          </li>
        )}
      </ul>
    </>
  );
}

function governmentRow(data: AtlasData, c: Chamber, lang: Lang): [string, ReactNode] {
  return [
    t("government", lang),
    <span className="flex flex-wrap items-center gap-1">
      {c.government.map((id) => data.entities[id]).filter(Boolean).map((p) => <PartyChip key={p.id} party={p} lang={lang} />)}
      <span className="ml-0.5 text-[12px] text-muted tabular-nums">
        {governmentSeats(c)} / {c.seats}
      </span>
    </span>,
  ];
}

function headRow(data: AtlasData, c: Chamber, lang: Lang): [string, ReactNode] {
  const party = data.entities[c.head.party];
  return [
    c.head.title[lang],
    <span className="flex flex-wrap items-center gap-1.5">
      {c.head.name[lang]}
      {party && <PartyChip party={party} lang={lang} />}
    </span>,
  ];
}

/** A territory's parliament: its seats, the government, the governor and how it is elected. */
export function LegislatureSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const L = entity.legislature;
  if (!L) return null;
  const note = (id: string) =>
    L.constituency?.[id] ? `${t("constituencySeats", lang)} ${L.constituency[id]}` : L.reserved_won?.[id] ? `${t("reservedSeats", lang)} ${L.reserved_won[id]}` : null;
  return (
    <Section title={t("legislatureTitle", lang)}>
      <p className="text-[14px] font-semibold text-ink">{L.names[lang]}</p>
      <ChamberView data={data} chamber={L} lang={lang} note={note} />
      <div className="mt-3">
        <Rows
          rows={[
            headRow(data, L, lang),
            governmentRow(data, L, lang),
            [t("majority", lang), `${majority(L)} ${t("seatsUnit", lang)}`],
            [t("turnout", lang), pct(L.turnout, lang)],
            [t("electoralSystem", lang), SYSTEM_NAMES[L.system][lang]],
            ...(L.overhang ? [[t("overhangSeats", lang), String(L.overhang)] as [string, string]] : []),
          ]}
        />
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">{systemText(L, lang)}</p>
      <p className="mt-2 text-[11px] text-faint">{t("politicsNote", lang)}</p>
    </Section>
  );
}

/** A city's council and mayor, or the assembly that decides in their place. */
export function CouncilSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const c = entity.council;
  if (!c) return null;
  if (!isChamber(c))
    return (
      <Section title={t("assemblyTitle", lang)}>
        <Paragraphs text={c.assembly[lang]} className="text-[13px] leading-relaxed text-ink" />
      </Section>
    );
  return (
    <Section title={t("councilTitle", lang)}>
      <ChamberView data={data} chamber={c} lang={lang} />
      <div className="mt-3">
        <Rows rows={[headRow(data, c, lang), governmentRow(data, c, lang), [t("turnout", lang), pct(c.turnout, lang)]]} />
      </div>
      <p className="mt-2.5 text-[11px] text-faint">{t("politicsNote", lang)}</p>
    </Section>
  );
}

/** How a district voted in the territorial election, the leading party's bar full length. */
export function ElectionSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const E = entity.election;
  if (!E?.vote.length) return null;
  const max = E.vote[0].vote;
  return (
    <Section title={t("electionTitle", lang)}>
      <ul className="-mx-1 space-y-0.5">
        {E.vote.map((v, i) => {
          const p = data.entities[v.id];
          if (!p) return null;
          return (
            <li key={v.id}>
              <button onClick={() => select(v.id)} className="group grid w-full grid-cols-[6.5rem_1fr_2.75rem] items-center gap-2.5 rounded-md px-1 py-[3px] text-left text-[12px] hover:bg-hover">
                <span className="truncate text-muted group-hover:text-ink">{shortName(p, lang)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-hover">
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: p.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(100 * v.vote) / max}%` }}
                    transition={{ duration: 0.6, delay: 0.04 * i, ease: "easeOut" }}
                  />
                </span>
                <span className="text-right text-ink tabular-nums">{pct(v.vote, lang)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3">
        <Rows rows={[[t("turnout", lang), pct(E.turnout, lang)]]} />
      </div>
      <p className="mt-2.5 text-[11px] text-faint">{t("politicsNote", lang)}</p>
    </Section>
  );
}

function SpectrumBar({ value, color, lang }: { value: number; color: string; lang: Lang }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-faint">
      {t("spectrumLeft", lang)}
      <span className="relative h-1.5 w-32 rounded-full bg-hover">
        {[-2, -1, 0, 1, 2].map((v) => (
          <span key={v} className={clsx("absolute top-1/2 w-px -translate-y-1/2 bg-faint/40", v === 0 ? "h-3" : "h-2")} style={{ left: `${((v + 3) / 6) * 100}%` }} />
        ))}
        <motion.span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow ring-2 ring-white/90"
          style={{ background: color }}
          initial={{ left: "50%" }}
          animate={{ left: `${((value + 3) / 6) * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        />
      </span>
      {t("spectrumRight", lang)}
    </span>
  );
}

/** One line per chamber a party sits in: its flag, name, share of the seats and its role there. */
function SeatRow({ party, at, seats, of, vote, lang }: { party: Entity; at: Entity; seats: number; of: number; vote?: number; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const chamber = at.legislature ?? (isChamber(at.council) ? at.council : undefined);
  const gov = chamber?.government.includes(party.id);
  const mayor = !at.legislature && chamber?.head.party === party.id;
  return (
    <li>
      <button onClick={() => select(at.id)} className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover">
        <span className="flex items-center gap-2 text-[13px]">
          {hasEmblem(at) ? <Emblem entity={at} size={20} className="shrink-0" /> : <span className="size-2 shrink-0 rounded-full bg-faint" />}
          <span className="min-w-0 flex-1 truncate text-ink">{at.short_names?.[lang] ?? displayName(at, lang)}</span>
          {mayor && <Tag tone="mayor">{t("mayorParty", lang)}</Tag>}
          {gov && !mayor && <Tag tone="gov">{t("inGovernment", lang)}</Tag>}
          {vote !== undefined && <span className="text-[11.5px] text-faint tabular-nums">{pct(vote, lang)}</span>}
          <span className="min-w-12 text-right font-semibold whitespace-nowrap text-ink tabular-nums">
            {seats}
            <span className="font-normal text-faint"> / {of}</span>
          </span>
        </span>
        <span className="mt-1 ml-7 block h-1 overflow-hidden rounded-full bg-hover">
          <span className="block h-full rounded-full" style={{ width: `${(100 * seats) / of}%`, background: party.color }} />
        </span>
      </button>
    </li>
  );
}

/** A party's card: who it is, what it wants, where it sits, its friends and how it began. */
export function PartySections({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const [allCouncils, setAllCouncils] = useState(false);
  if (entity.kind !== "party") return null;
  const color = entity.color ?? "var(--ui-accent)";
  const held = entity.seats ?? [];
  const councils = held
    .filter((s) => data.entities[s.at]?.subtype === "locality")
    .sort((a, b) => b.seats / b.of - a.seats / a.of);
  const allies = (entity.allies ?? []).map((id) => data.entities[id]).filter(Boolean);
  return (
    <>
      <Section title={t("partyProfile", lang)}>
        <Rows
          rows={[
            ...(entity.family ? [[t("ideology", lang), entity.family[lang]] as [string, ReactNode]] : []),
            ...(entity.spectrum !== undefined ? [[t("spectrumLabel", lang), <SpectrumBar value={entity.spectrum} color={color} lang={lang} />] as [string, ReactNode]] : []),
            ...(entity.leader ? [[entity.leader_title?.[lang] ?? t("partyLeader", lang), entity.leader[lang]] as [string, ReactNode]] : []),
            ...(entity.youth_wing ? [[t("youthWing", lang), entity.youth_wing[lang]] as [string, ReactNode]] : []),
            ...(entity.slogan
              ? [[t("slogan", lang), <span className="font-medium italic">{lang === "zh" ? `「${entity.slogan.zh}」` : `“${entity.slogan.en}”`}</span>] as [string, ReactNode]]
              : []),
          ]}
        />
      </Section>
      {entity.policies?.length ? (
        <Section title={t("policies", lang)}>
          <ul className="space-y-2">
            {entity.policies.map((p) => (
              <li key={p.en} className="flex gap-2.5 text-[13px] leading-snug text-ink">
                <span className="mt-[6px] size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                {p[lang]}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title={t("partySeats", lang)}>
        <Sub label={t("territorialSeats", lang)}>
          <ul className="-mx-2">
            {(entity.territories ?? []).map((tid) => {
              const at = data.entities[tid];
              const L = at?.legislature;
              if (!at || !L) return null;
              const row = L.parties.find((p) => p.id === entity.id);
              return <SeatRow key={tid} party={entity} at={at} seats={row?.seats ?? 0} of={L.seats} vote={row?.vote} lang={lang} />;
            })}
          </ul>
        </Sub>
        <Sub label={`${t("councilSeats", lang)} · ${councils.length}`}>
          {councils.length ? (
            <>
              <ul className="-mx-2">
                {(allCouncils ? councils : councils.slice(0, COUNCILS_SHOWN)).map((s) => {
                  const at = data.entities[s.at];
                  return at ? <SeatRow key={s.at} party={entity} at={at} seats={s.seats} of={s.of} lang={lang} /> : null;
                })}
              </ul>
              {councils.length > COUNCILS_SHOWN && (
                <button onClick={() => setAllCouncils((v) => !v)} className="mt-1 -ml-2 rounded-full px-2 py-1 text-[12px] font-medium text-muted hover:bg-hover hover:text-ink">
                  {allCouncils ? t("showFewer", lang) : `${t("showAll", lang)} · ${councils.length}`}
                </button>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-muted">{t("noSeats", lang)}</p>
          )}
        </Sub>
      </Section>
      {allies.length > 0 && (
        <Section title={t("allies", lang)}>
          <ul className="-mx-2 grid grid-cols-2 gap-0.5">
            {allies.map((a) => (
              <li key={a.id}>
                <button onClick={() => select(a.id)} className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover">
                  <Emblem entity={a} size={22} className="shrink-0" />
                  <span className="truncate">{displayName(a, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {entity.history && (
        <Section title={t("history", lang)}>
          <Paragraphs text={entity.history[lang]} className="text-[13px] leading-relaxed text-ink" />
        </Section>
      )}
    </>
  );
}
