import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { Fragment, useState, type ReactNode } from "react";
import { displayName, formatNumber, t, type StringKey } from "../lib/i18n";
import { governmentSeats, majority, PARTY_AXES, SYSTEM_NAMES, systemText } from "../lib/politics";
import type { AtlasData, Chamber, Entity, Lang, Legislature, Localized, Seating } from "../lib/types";
import { useAtlas } from "../store";
import { Paragraphs, Rows, Section, Sub, useCardOpen } from "./CardParts";
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
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-px text-[12px] text-ink transition-colors hover:bg-hover"
      style={{ borderColor: `color-mix(in srgb, ${party.color} 40%, transparent)`, background: `color-mix(in srgb, ${party.color} 10%, transparent)` }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: party.color }} />
      <span className="truncate">{shortName(party, lang)}</span>
    </button>
  );
}

function Tag({ tone, children }: { tone: "gov" | "mayor" | "plain"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-1.5 py-px text-[10px] leading-tight font-semibold",
        tone === "gov" ? "bg-emerald-500/15 text-emerald-500" : tone === "mayor" ? "bg-amber-400/15 text-amber-500" : "bg-hover text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** One branch of government under its own small heading, ruled off to the right. */
export function Branch({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <h4 className="mb-2.5 flex items-center gap-2 text-[11.5px] font-semibold text-muted">
        {label}
        <span className="h-px flex-1 bg-line" />
      </h4>
      {children}
    </div>
  );
}

/** The formal name of a body, given room of its own above what it does. */
export function BodyName({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="mb-2.5">
      <p className="text-[14.5px] leading-snug font-semibold text-ink text-balance">{name}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

/** An officeholder's name, then their party (or a note such as who appointed them). */
function Holder({ data, name, party, note, lang }: { data: AtlasData; name: Localized; party?: string; note?: string; lang: Lang }) {
  const p = party ? data.entities[party] : undefined;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-ink">{name[lang]}</span>
      {p ? <PartyChip party={p} lang={lang} /> : note ? <Tag tone="plain">{note}</Tag> : null}
    </span>
  );
}

const holderRow = (data: AtlasData, title: Localized, h: { name: Localized; party?: string }, lang: Lang, note?: string): [string, ReactNode] => [
  title[lang],
  <Holder data={data} name={h.name} party={h.party} note={note} lang={lang} />,
];

const NON_PARTISAN = "var(--ui-faint)";

/** The hemicycle and, under it, every party in the chamber; hovering a party lights its seats. */
function ChamberView({ data, chamber, lang, note, govLabel }: { data: AtlasData; chamber: Seating; lang: Lang; note?: (id: string) => string | null; govLabel?: string }) {
  const select = useAtlas((s) => s.select);
  const [hover, setHover] = useState<string | null>(null);
  const listed = chamber.parties.filter((p) => p.seats || p.vote >= MINOR_VOTE);
  const rest = chamber.parties.filter((p) => !p.seats && p.vote < MINOR_VOTE);
  return (
    <>
      <Hemicycle data={data} chamber={chamber} lang={lang} highlight={hover} />
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
                <span className="flex min-w-0 items-start gap-2">
                  <span className="mt-[5px] size-2.5 shrink-0 rounded-full" style={{ background: party.color }} />
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                    <span className="text-ink">{displayName(party, lang)}</span>
                    {chamber.government.includes(p.id) && <Tag tone="gov">{govLabel ?? t("government", lang)}</Tag>}
                    {extra && <span className="text-[11px] whitespace-nowrap text-faint">{extra}</span>}
                  </span>
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

/** An elected head's general election: their share, then who came second and theirs. */
function runoffRow(data: AtlasData, h: Chamber["head"], lang: Lang): [string, ReactNode][] {
  const r = h.runner_up;
  const p = r && data.entities[r.party];
  if (h.vote === undefined || !r) return [];
  return [
    [
      t("generalElection", lang),
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-ink tabular-nums">{pct(h.vote, lang)}</span>
        <span className="text-faint">{t("versus", lang)}</span>
        {r.name && <span className="text-ink">{r.name[lang]}</span>}
        {p && <PartyChip party={p} lang={lang} />}
        <span className="text-muted tabular-nums">{pct(r.vote, lang)}</span>
      </span>,
    ],
  ];
}

/** The rows under a chamber: its speaker, who holds the majority and what that takes. */
function seatingRows(data: AtlasData, c: Seating, lang: Lang, elected: boolean): [string, ReactNode][] {
  return [
    holderRow(data, c.speaker.title, c.speaker, lang),
    governmentRow(data, c, lang, elected ? t("majorityParty", lang) : undefined),
    [t("majority", lang), `${majority(c)} ${t("seatsUnit", lang)}`],
    ...(c.same_party !== undefined ? [[t("sameParty", lang), `${c.same_party} / ${c.seats}`] as [string, string]] : []),
  ];
}

function governmentRow(data: AtlasData, c: Seating, lang: Lang, label = t("government", lang)): [string, ReactNode] {
  return [
    label,
    <span className="flex flex-wrap items-center gap-1">
      {c.government.map((id) => data.entities[id]).filter(Boolean).map((p) => <PartyChip key={p.id} party={p} lang={lang} />)}
      <span className="ml-0.5 text-[12px] text-muted tabular-nums">
        {governmentSeats(c)} / {c.seats}
      </span>
    </span>,
  ];
}

/** The ministries as one bar in the colours of the parties holding them; opened, every minister by ministry. */
function Cabinet({ data, L, lang }: { data: AtlasData; L: Legislature; lang: Lang }) {
  const [open, setOpen] = useCardOpen("ministers");
  const experts = L.ministers.filter((m) => !m.party).length;
  const parts = [
    ...L.cabinet.map((c) => ({ key: c.id, n: c.seats, color: data.entities[c.id]?.color, label: data.entities[c.id] ? shortName(data.entities[c.id], lang) : c.id })),
    ...(experts ? [{ key: "", n: experts, color: NON_PARTISAN, label: t("nonPartisan", lang) }] : []),
  ];
  const total = L.ministers.length;
  const departments = L.ministers.every((m) => m.ministry.zh.endsWith("厅"));
  const ministry = (m: Localized) => (lang === "en" ? m.en.replace(/^(Ministry|Department) of /, "") : m.zh);
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-baseline justify-between text-[11px] text-faint">
        <span>{t("cabinet", lang)}</span>
        <span className="tabular-nums">{lang === "zh" ? `${total} 个${departments ? "厅" : "部"}` : `${total} ${departments ? "departments" : "ministries"}`}</span>
      </p>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
        {parts.map((c, i) => (
          <motion.span
            key={c.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: c.color }}
            initial={{ width: 0 }}
            animate={{ width: `${(100 * c.n) / total}%` }}
            transition={{ duration: 0.6, delay: 0.05 * i, ease: "easeOut" }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px]">
        {parts.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full" style={{ background: c.color }} />
            {c.label}
            <span className="text-ink tabular-nums">{c.n}</span>
          </span>
        ))}
      </div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-2 -ml-2 flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? t("hideMinisters", lang) : `${t("showMinisters", lang)} · ${total}`}
      </button>
      {open && (
        <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 divide-y divide-line/60">
          {L.ministers.map((m) => (
            <li key={m.ministry.en} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-3 py-1.5 text-[12.5px]">
              <span className="leading-snug text-muted">{ministry(m.ministry)}</span>
              <Holder data={data} name={m.name} party={m.party} note={t("nonPartisan", lang)} lang={lang} />
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

/** A territory's politics: who governs and how, the parliament that elects them, and the highest court. */
export function LegislatureSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const L = entity.legislature;
  if (!L) return null;
  const note = (id: string) =>
    L.constituency?.[id] ? `${t("constituencySeats", lang)} ${L.constituency[id]}` : L.reserved_won?.[id] ? `${t("reservedSeats", lang)} ${L.reserved_won[id]}` : null;
  const elected = !!L.elected;
  const govLabel = elected ? t("majorityParty", lang) : undefined;
  const [speakerRow, ...majorityRows] = seatingRows(data, L, lang, elected);
  return (
    <Section title={t("politicsTitle", lang)}>
      <Branch label={t("executive", lang)}>
        <Rows
          rows={[
            ...(L.governor ? [holderRow(data, L.governor.title, L.governor, lang, L.governor.note?.[lang] ?? t("centralAppointee", lang))] : []),
            holderRow(data, L.head.title, L.head, lang),
            ...runoffRow(data, L.head, lang),
            ...(L.deputy ? [holderRow(data, L.deputy.title, L.deputy, lang)] : []),
          ]}
        />
        <Cabinet data={data} L={L} lang={lang} />
      </Branch>
      <Branch label={t("legislature", lang)}>
        <BodyName name={L.names[lang]} sub={`${SYSTEM_NAMES[L.system][lang]} · ${L.seats} ${t("seatsUnit", lang)}`} />
        <ChamberView data={data} chamber={L} lang={lang} note={note} govLabel={govLabel} />
        <div className="mt-3">
          <Rows
            rows={[
              speakerRow,
              ...(L.opposition ? [holderRow(data, L.opposition.title ?? { zh: t("oppositionLeader", "zh"), en: t("oppositionLeader", "en") }, L.opposition, lang)] : []),
              ...majorityRows,
              [t("turnout", lang), pct(L.turnout, lang)],
              ...(L.overhang ? [[t("overhangSeats", lang), String(L.overhang)] as [string, string]] : []),
            ]}
          />
        </div>
        {L.upper && (
          <div className="mt-5">
            <BodyName name={L.upper.names[lang]} sub={`${SYSTEM_NAMES[L.system][lang]} · ${L.upper.seats} ${t("seatsUnit", lang)}`} />
            <ChamberView data={data} chamber={L.upper} lang={lang} govLabel={govLabel} />
            <div className="mt-3">
              <Rows rows={seatingRows(data, L.upper, lang, elected)} />
            </div>
          </div>
        )}
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">{L.system_notes?.[lang] ?? systemText(L, lang)}</p>
        {L.notes && <Paragraphs text={L.notes[lang]} className="mt-2 text-[12.5px] leading-relaxed text-muted" />}
      </Branch>
      <Branch label={t("judiciary", lang)}>
        <BodyName name={L.court.names[lang]} sub={lang === "zh" ? `法官 ${L.court.judges.length + 1} 人` : `${L.court.judges.length + 1} judges`} />
        <Rows
          rows={[
            ...(L.court.law ? [[t("legalSystem", lang), L.court.law[lang]] as [string, string]] : []),
            holderRow(data, L.court.title, L.court, lang),
            [t("judges", lang), <span className="leading-relaxed text-ink">{L.court.judges.map((j) => j[lang]).join(lang === "zh" ? "、" : ", ")}</span>],
          ]}
        />
      </Branch>
      {L.agencies?.length ? (
        <Branch label={t("agencies", lang)}>
          <Rows
            rows={L.agencies.map((a) => [
              a.names[lang],
              <span className="text-ink">
                <span className="text-muted">{a.title[lang]}</span> {a.name[lang]}
              </span>,
            ] as [string, ReactNode])}
          />
        </Branch>
      ) : null}
    </Section>
  );
}

/** A city's politics: the mayor, and the council with its speaker. */
export function CouncilSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const c = entity.council;
  if (!c) return null;
  return (
    <Section title={t("politicsTitle", lang)}>
      <Branch label={t("executive", lang)}>
        <Rows rows={[holderRow(data, c.head.title, c.head, lang), ...runoffRow(data, c.head, lang), ...(c.deputy ? [holderRow(data, c.deputy.title, c.deputy, lang)] : [])]} />
      </Branch>
      <Branch label={t("legislature", lang)}>
        <BodyName name={c.names[lang]} sub={`${c.seats} ${t("seatsUnit", lang)}`} />
        {c.notes && <Paragraphs text={c.notes[lang]} className="mb-3 text-[13px] leading-relaxed text-ink" />}
        <ChamberView data={data} chamber={c} lang={lang} govLabel={c.elected ? t("majorityParty", lang) : undefined} />
        <div className="mt-3">
          <Rows rows={[...seatingRows(data, c, lang, !!c.elected), [t("turnout", lang), pct(c.turnout, lang)]]} />
        </div>
      </Branch>
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
    </Section>
  );
}

/** A position on a scale, as a dot on a track with its two poles named under it. */
function Scale({ label, value, min, max, poles, color }: { label: string; value: number; min: number; max: number; poles: [string, string]; color: string }) {
  const at = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="grid grid-cols-[4.75rem_1fr] items-start gap-3">
      <span className="pt-px text-[12px] text-muted">{label}</span>
      <div>
        <span className="relative block h-1.5 rounded-full bg-hover">
          <span className="absolute top-1/2 left-1/2 h-2.5 w-px -translate-y-1/2 bg-faint/40" />
          <motion.span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow ring-2 ring-white/90"
            style={{ background: color }}
            initial={{ left: "50%" }}
            animate={{ left: at }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        </span>
        <span className="mt-1 flex justify-between text-[10.5px] text-faint">
          <span>{poles[0]}</span>
          <span>{poles[1]}</span>
        </span>
      </div>
    </div>
  );
}

const AXIS_KEYS: Record<(typeof PARTY_AXES)[number], [StringKey, StringKey, StringKey]> = {
  econ: ["axisEcon", "spectrumLeft", "spectrumRight"],
  galtan: ["axisGaltan", "poleLibertarian", "poleTraditional"],
  autonomy: ["axisAutonomy", "poleSelfRule", "poleCentral"],
  green: ["axisGreen", "poleEcology", "poleGrowth"],
};

/** One line per chamber a party sits in: its flag, name, share of the seats and its role there. */
function SeatRow({ party, at, seats, of, vote, upper, lang }: { party: Entity; at: Entity; seats: number; of: number; vote?: number; upper?: boolean; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const chamber = at.legislature ?? at.council;
  const seating = upper ? at.legislature?.upper : chamber;
  const gov = seating?.government.includes(party.id);
  const head = !upper && (!at.legislature || chamber?.elected) && chamber?.head.party === party.id;
  return (
    <li>
      <button onClick={() => select(at.id)} className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover">
        <span className="flex items-center gap-2 text-[13px]">
          {hasEmblem(at) ? <Emblem entity={at} size={20} className="shrink-0" /> : <span className="size-2 shrink-0 rounded-full bg-faint" />}
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
            <span className="text-ink">{upper && seating ? seating.names[lang] : (at.short_names?.[lang] ?? displayName(at, lang))}</span>
            {head && <Tag tone="mayor">{chamber.head.title[lang]}</Tag>}
            {gov && !head && <Tag tone="gov">{t(chamber?.elected ? "inMajority" : "inGovernment", lang)}</Tag>}
          </span>
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

function Chips({ items, color, lang }: { items: Localized[]; color?: string; lang: Lang }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li
          key={x.en}
          className={clsx("rounded-full border px-2.5 py-0.5 text-[12px]", color ? "text-ink" : "border-line text-muted")}
          style={color ? { background: `color-mix(in srgb, ${color} 9%, transparent)`, borderColor: `color-mix(in srgb, ${color} 28%, transparent)` } : undefined}
        >
          {x[lang]}
        </li>
      ))}
    </ul>
  );
}

/** The party's role in a territory: premier, leader of the opposition, or simply its leader there. */
function branchRole(at: Entity, party: string, lang: Lang): string | null {
  const L = at.legislature;
  if (!L) return null;
  if (L.head.party === party) return L.head.title[lang];
  if (L.opposition?.party === party) return L.opposition.title?.[lang] ?? t("oppositionLeader", lang);
  return null;
}

export type PartyPart = "profile" | "positions" | "organisation" | "seats" | "history";

/** A party's card: who it is and where it stands, who votes for it, what it wants, how it is run and where it sits;
 * one `part` of it, or all. */
export function PartySections({ data, entity, lang, part }: { data: AtlasData; entity: Entity; lang: Lang; part?: PartyPart }) {
  const select = useAtlas((s) => s.select);
  const [allCouncils, setAllCouncils] = useCardOpen("councils");
  if (entity.kind !== "party") return null;
  const show = (p: PartyPart) => !part || part === p;
  const color = entity.color ?? "var(--ui-accent)";
  const held = entity.seats ?? [];
  const national = (entity.territories ?? []).some((id) => data.entities[id]?.role === "nation");
  const councils = held
    .filter((s) => data.entities[s.at]?.subtype === "locality" && !data.entities[s.at]?.role)
    .sort((a, b) => b.seats / b.of - a.seats / a.of);
  const allies = (entity.allies ?? []).map((id) => data.entities[id]).filter(Boolean);
  const org = entity.organisation ?? {};
  const orgRows: [string, ReactNode][] = [
    ...(entity.youth_wing ? [[t("youthWing", lang), entity.youth_wing[lang]] as [string, ReactNode]] : []),
    ...(["newspaper", "think_tank", "unions", "women"] as const).filter((k) => org[k]).map((k) => [t(ORG_KEYS[k], lang), org[k]![lang]] as [string, ReactNode]),
  ];
  return (
    <>
      {show("profile") && <Section title={t("partyProfile", lang)}>
        <Rows
          rows={[
            ...(entity.family ? [[t("partyFamily", lang), <span className="font-medium">{entity.family[lang]}</span>] as [string, ReactNode]] : []),
            ...(entity.leader ? [[entity.leader_title?.[lang] ?? t("partyLeader", lang), entity.leader[lang]] as [string, ReactNode]] : []),
            ...(entity.secretary ? [[t("secretary", lang), entity.secretary[lang]] as [string, ReactNode]] : []),
            ...(entity.slogan
              ? [[t("slogan", lang), <span className="font-medium italic">{lang === "zh" ? `「${entity.slogan.zh}」` : `“${entity.slogan.en}”`}</span>] as [string, ReactNode]]
              : []),
          ]}
        />
        {entity.ideology?.length ? (
          <Sub label={t("ideology", lang)}>
            <Chips items={entity.ideology} color={color} lang={lang} />
          </Sub>
        ) : null}
      </Section>}
      {show("positions") && (entity.axes || entity.spectrum !== undefined) && (
        <Section title={t("positions", lang)}>
          <div className="space-y-2.5">
            {entity.spectrum !== undefined && (
              <Scale label={t("spectrumLabel", lang)} value={entity.spectrum} min={-3} max={3} poles={[t("spectrumLeft", lang), t("spectrumRight", lang)]} color={color} />
            )}
            {entity.axes &&
              PARTY_AXES.map((k) => {
                const [label, lo, hi] = AXIS_KEYS[k];
                return <Scale key={k} label={t(label, lang)} value={entity.axes![k]} min={0} max={10} poles={[t(lo, lang), t(hi, lang)]} color={color} />;
              })}
          </div>
        </Section>
      )}
      {show("positions") && entity.base && (entity.base.strong.length > 0 || entity.base.weak.length > 0) && (
        <Section title={t("voters", lang)}>
          {entity.base.strong.length > 0 && (
            <Sub label={t("strongAmong", lang)}>
              <Chips items={entity.base.strong} color={color} lang={lang} />
            </Sub>
          )}
          {entity.base.weak.length > 0 && (
            <Sub label={t("weakAmong", lang)}>
              <Chips items={entity.base.weak} lang={lang} />
            </Sub>
          )}
        </Section>
      )}
      {show("positions") && entity.policies?.length ? (
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
      {show("positions") && entity.factions?.length ? (
        <Section title={t("factions", lang)}>
          <ul className="space-y-3">
            {entity.factions.map((f) => (
              <li key={f.names.en} className="border-l-2 pl-3" style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}>
                <p className="text-[13px] font-semibold text-ink">{f.names[lang]}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{f.notes[lang]}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {show("organisation") && (orgRows.length > 0 || (entity.branches?.length ?? 0) > 1) && (
        <Section title={t("organisation", lang)}>
          {orgRows.length > 0 && <Rows rows={orgRows} />}
          {(entity.branches?.length ?? 0) > 1 && (
            <Sub label={t("branches", lang)}>
              <ul className="-mx-2">
                {entity.branches!.map((b) => {
                  const at = data.entities[b.at];
                  if (!at) return null;
                  const role = branchRole(at, entity.id, lang);
                  return (
                    <li key={b.at}>
                      <button onClick={() => select(b.at)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-hover">
                        {hasEmblem(at) && <Emblem entity={at} size={20} className="shrink-0" />}
                        <span className="min-w-0 flex-1 truncate text-muted">{at.short_names?.[lang] ?? displayName(at, lang)}</span>
                        {role && <Tag tone="gov">{role}</Tag>}
                        <span className="shrink-0 text-ink">{b.name[lang]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Sub>
          )}
        </Section>
      )}
      {show("seats") && <Section title={t("partySeats", lang)}>
        <Sub label={t(national ? "nationalSeats" : "territorialSeats", lang)}>
          <ul className="-mx-2">
            {(entity.territories ?? []).map((tid) => {
              const at = data.entities[tid];
              const L = at?.legislature;
              if (!at || !L) return null;
              const row = L.parties.find((p) => p.id === entity.id);
              const up = L.upper?.parties.find((p) => p.id === entity.id);
              return (
                <Fragment key={tid}>
                  <SeatRow party={entity} at={at} seats={row?.seats ?? 0} of={L.seats} vote={row?.vote} lang={lang} />
                  {L.upper && <SeatRow party={entity} at={at} seats={up?.seats ?? 0} of={L.upper.seats} upper lang={lang} />}
                </Fragment>
              );
            })}
          </ul>
        </Sub>
        {!national && <Sub label={`${t("councilSeats", lang)} · ${councils.length}`}>
          {councils.length ? (
            <>
              <ul className="-mx-2">
                {(allCouncils ? councils : councils.slice(0, COUNCILS_SHOWN)).map((s) => {
                  const at = data.entities[s.at];
                  return at ? <SeatRow key={s.at} party={entity} at={at} seats={s.seats} of={s.of} lang={lang} /> : null;
                })}
              </ul>
              {councils.length > COUNCILS_SHOWN && (
                <button onClick={() => setAllCouncils(!allCouncils)} className="mt-1 -ml-2 rounded-full px-2 py-1 text-[12px] font-medium text-muted hover:bg-hover hover:text-ink">
                  {allCouncils ? t("showFewer", lang) : `${t("showAll", lang)} · ${councils.length}`}
                </button>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-muted">{t("noSeats", lang)}</p>
          )}
        </Sub>}
      </Section>}
      {show("history") && allies.length > 0 && (
        <Section title={t("allies", lang)}>
          <ul className="-mx-2 grid grid-cols-2 gap-0.5">
            {allies.map((a) => (
              <li key={a.id}>
                <button onClick={() => select(a.id)} className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover">
                  <Emblem entity={a} size={22} className="shrink-0" />
                  <span className="truncate">{shortName(a, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {show("history") && entity.history && (
        <Section title={t("history", lang)}>
          <Paragraphs text={entity.history[lang]} className="text-[13px] leading-relaxed text-ink" />
        </Section>
      )}
    </>
  );
}

const ORG_KEYS: Record<"newspaper" | "think_tank" | "unions" | "women", StringKey> = {
  newspaper: "newspaper",
  think_tank: "thinkTank",
  unions: "affiliates",
  women: "womensOrg",
};
