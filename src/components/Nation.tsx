import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Paragraphs, Rows, Section, Sub, useCardOpen } from "./CardParts";
import { Emblem, hasEmblem } from "./Emblem";
import { Hemicycle } from "./Hemicycle";
import { BodyName, Branch, type PartyPart } from "./Politics";
import { displayName, formatNumber, formatPopulation, t } from "../lib/i18n";
import type { AtlasData, Entity, FixedChamber, Lang, Localized, NationFacts, Seating, WarStatus } from "../lib/types";
import { useAtlas } from "../store";

const L = {
  groupOverview: { zh: "概况", en: "Overview" },
  groupPolitics: { zh: "政治", en: "Politics" },
  groupMilitary: { zh: "军事与冲突", en: "Military & conflict" },
  groupSociety: { zh: "社会", en: "Society" },
  groupEconomy: { zh: "经济", en: "Economy" },
  groupGeography: { zh: "地理", en: "Geography" },
  groupSymbols: { zh: "象征", en: "Symbols" },
  groupFacts: { zh: "资料", en: "Facts" },
  groupMembers: { zh: "成员", en: "Members" },
  identity: { zh: "国家", en: "State" },
  ideology: { zh: "意识形态", en: "Ideology" },
  government: { zh: "政体", en: "Government" },
  powerHolder: { zh: "实际掌权", en: "Real power" },
  capital: { zh: "首都", en: "Capital" },
  recognition: { zh: "外交承认", en: "Recognition" },
  recognisedBy: { zh: "获 {n} / {of} 个岛内国家承认", en: "Recognised by {n} of {of} island states" },
  unrecognised: { zh: "未获任何岛内国家承认", en: "Recognised by no island state" },
  bloc: { zh: "阵营", en: "Bloc" },
  neutral: { zh: "中立", en: "Neutral" },
  legislature: { zh: "立法机构", en: "Legislature" },
  fixedSeats: { zh: "议席由制度固定分配，不经竞争性选举", en: "Seats are allotted by the system, not won in contested elections" },
  relations: { zh: "对外关系", en: "Relations" },
  allies: { zh: "盟友", en: "Allies" },
  rivals: { zh: "敌对", en: "Rivals" },
  backers: { zh: "外部支持", en: "Outside backers" },
  military: { zh: "武装力量", en: "Armed forces" },
  strength: { zh: "军力等级", en: "Strength" },
  active: { zh: "现役", en: "Active" },
  reserve: { zh: "预备役", en: "Reserve" },
  budget: { zh: "军费占 GDP", en: "Spending, % of GDP" },
  branches: { zh: "军种", en: "Branches" },
  equipment: { zh: "装备", en: "Equipment" },
  wars: { zh: "战争与冲突", en: "Wars and conflicts" },
  refugees: { zh: "难民", en: "Refugees" },
  hosted: { zh: "境内收容", en: "Hosted" },
  abroad: { zh: "流亡境外", en: "Abroad" },
  religion: { zh: "宗教信仰", en: "Religion" },
  freedom: { zh: "自由指数", en: "Freedom" },
  political: { zh: "政治权利", en: "Political rights" },
  civil: { zh: "公民自由", en: "Civil liberties" },
  press: { zh: "新闻自由", en: "Press freedom" },
  economic: { zh: "经济自由", en: "Economic freedom" },
  freedomNote: { zh: "0 为完全没有，100 为完全自由", en: "0 is none, 100 is full" },
  national: { zh: "国家象征", en: "National symbols" },
  anthem: { zh: "国歌", en: "Anthem" },
  flower: { zh: "国花", en: "Flower" },
  animal: { zh: "国兽", en: "Animal" },
  facts: { zh: "基本资料", en: "Basic facts" },
  currency: { zh: "货币", en: "Currency" },
  timeZone: { zh: "时区", en: "Time zone" },
  callingCode: { zh: "电话区号", en: "Calling code" },
  tld: { zh: "顶级域名", en: "Internet domain" },
  driving: { zh: "行车方向", en: "Drives on the" },
  left: { zh: "靠左行驶", en: "left" },
  right: { zh: "靠右行驶", en: "right" },
  doctrine: { zh: "纲领", en: "Doctrine" },
  leaderNation: { zh: "盟主", en: "Leading nation" },
  memberCount: { zh: "成员国", en: "Members" },
  troops: { zh: "现役总兵力", en: "Active troops" },
  backedNations: { zh: "在拉诺瓦岛支持的国家", en: "Nations it backs on Ranova" },
  backedNote: {
    zh: "公开或暗中提供援助、武器、贷款或外交庇护的国家。",
    en: "Nations it gives aid, arms, loans or diplomatic cover, openly or not.",
  },
  people: { zh: "人", en: "" },
  groupPositions: { zh: "立场", en: "Positions" },
  seat: { zh: "驻地", en: "Seat" },
  claims: { zh: "主张领土", en: "Claims" },
  groupOrganisation: { zh: "组织", en: "Organisation" },
  groupSeats: { zh: "议席", en: "Seats" },
  groupHistory: { zh: "沿革与友党", en: "History & allies" },
  groupRelations: { zh: "对外关系", en: "Relations" },
} satisfies Record<string, Localized>;

const tl = (key: keyof typeof L, lang: Lang) => L[key][lang];

const STRENGTH: Localized[] = [
  { zh: "微弱", en: "Token" },
  { zh: "有限", en: "Limited" },
  { zh: "中等", en: "Moderate" },
  { zh: "较强", en: "Strong" },
  { zh: "强大", en: "Powerful" },
];

const WAR_STATUS: Record<WarStatus, { label: Localized; className: string }> = {
  active: { label: { zh: "交战中", en: "Active" }, className: "bg-rose-500/15 text-rose-500" },
  ceasefire: { label: { zh: "停火", en: "Ceasefire" }, className: "bg-amber-500/15 text-amber-600" },
  frozen: { label: { zh: "冻结", en: "Frozen" }, className: "bg-sky-500/15 text-sky-600" },
  ended: { label: { zh: "已结束", en: "Ended" }, className: "bg-hover text-muted" },
};

const people = (n: number, lang: Lang) => (lang === "zh" ? `${formatPopulation(n, lang)}${tl("people", lang)}` : formatPopulation(n, lang));

/** The nearest scrolling ancestor: the card on a desktop, the sheet on a phone. */
function scrollerOf(el: HTMLElement | null) {
  for (let p = el?.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  return null;
}

/** The height of the card's pinned bar, which group titles stick under. */
const PINNED = 44;

/** A group of a card; `show: false` leaves out a group whose sections would all be empty. */
type GroupDef = { key: string; title: string; body: ReactNode; show?: boolean };

/** The card's groups under titles that stay pinned while their group scrolls past, with a row of jumps to each. */
function Groups({ groups: all, accent }: { groups: GroupDef[]; accent: string }) {
  const groups = all.filter((g) => g.show !== false);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [current, setCurrent] = useState(groups[0]?.key);
  const keys = groups.map((g) => g.key).join(" ");
  useEffect(() => {
    const list = keys.split(" ");
    const scroller = scrollerOf(refs.current[list[0]] ?? null);
    if (!scroller) return;
    const update = () => {
      const top = scroller.getBoundingClientRect().top + PINNED + 8;
      let at = list[0];
      for (const k of list) if ((refs.current[k]?.getBoundingClientRect().top ?? Infinity) <= top) at = k;
      setCurrent(at);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [keys]);
  const jump = (key: string) => {
    const el = refs.current[key];
    const scroller = scrollerOf(el ?? null);
    if (!el || !scroller) return;
    const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - PINNED + 1;
    scroller.scrollTo({ top, behavior: "smooth" });
  };
  return (
    <>
      <nav className="scrollbar-none flex gap-1.5 overflow-x-auto px-5 pb-3" aria-label={groups.map((g) => g.title).join(" · ")}>
        {groups.map((g) => (
          <button
            key={g.key}
            onClick={() => jump(g.key)}
            className={clsx(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              current === g.key ? "text-white" : "border-line text-muted hover:bg-hover hover:text-ink",
            )}
            style={current === g.key ? { background: accent, borderColor: accent } : undefined}
          >
            {g.title}
          </button>
        ))}
      </nav>
      {groups.map((g) => (
        <div key={g.key} ref={(el) => void (refs.current[g.key] = el)} className="[&>section:first-of-type]:border-t-0">
          <h3 className="sticky z-10 flex items-center gap-2 border-t border-line bg-panel-solid px-5 py-2 text-[12.5px] font-semibold text-ink" style={{ top: PINNED }}>
            <span className="h-3.5 w-1 rounded-full" style={{ background: accent }} />
            {g.title}
          </h3>
          {g.body}
        </div>
      ))}
    </>
  );
}

/** A state as a small flag and its short name, opening its card. */
function StateChip({ data, id, lang, tone }: { data: AtlasData; id: string; lang: Lang; tone?: string }) {
  const select = useAtlas((s) => s.select);
  const e = data.entities[id];
  if (!e) return null;
  return (
    <button
      onClick={() => select(id)}
      disabled={!e.bbox}
      className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-2.5 pl-1 text-[12px] text-ink transition-colors enabled:hover:bg-hover"
      style={tone ? { borderColor: `color-mix(in srgb, ${tone} 35%, transparent)` } : undefined}
    >
      {hasEmblem(e) ? <Emblem entity={e} size={18} className="shrink-0" /> : <span className="ml-1 size-2 rounded-full" style={{ background: e.color ?? "var(--ui-faint)" }} />}
      {e.short_names?.[lang] ?? displayName(e, lang)}
    </button>
  );
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function BlocBadge({ data, facts, lang }: { data: AtlasData; facts: NationFacts; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const bloc = facts.bloc ? data.entities[facts.bloc] : undefined;
  if (!bloc)
    return <span className="rounded-full border border-line px-2 py-0.5 text-[12px] text-muted">{tl("neutral", lang)}</span>;
  return (
    <button
      onClick={() => select(bloc.id)}
      className="flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-[12px] font-semibold text-white shadow-sm transition-transform hover:scale-[1.03]"
      style={{ background: bloc.color }}
    >
      {bloc.short_names?.[lang] ?? displayName(bloc, lang)}
      {facts.bloc_role && <span className="font-normal opacity-80">· {facts.bloc_role[lang]}</span>}
    </button>
  );
}

/** The other states of the nation's region; for a government in exile, every state on its island. */
function otherStates(data: AtlasData, entity: Entity) {
  const region = entity.role === "region" ? entity : data.entities[entity.parent ?? ""];
  return (region?.children ?? []).filter((id) => id !== entity.id && data.entities[id]?.role === "nation").length;
}

function IdentitySection({ data, entity, facts, lang }: { data: AtlasData; entity: Entity; facts: NationFacts; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const capital = entity.capital ? data.entities[entity.capital] : undefined;
  const others = otherStates(data, entity);
  const seat = facts.exile ? data.entities[facts.exile.seat] : undefined;
  const recognised = facts.recognition
    ? tl("recognisedBy", lang).replace("{n}", String(facts.recognition)).replace("{of}", String(others))
    : tl("unrecognised", lang);
  return (
    <Section title={tl("identity", lang)}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <BlocBadge data={data} facts={facts} lang={lang} />
        {facts.ideology.map((i) => (
          <span key={i.en} className="rounded-full bg-hover px-2 py-0.5 text-[12px] text-ink">
            {i[lang]}
          </span>
        ))}
      </div>
      <Rows
        rows={[
          [tl("government", lang), facts.government[lang]],
          [facts.head.title[lang], facts.head.name[lang]],
          [tl("powerHolder", lang), facts.power[lang]],
          ...(capital
            ? ([[tl("capital", lang), <button key="c" onClick={() => select(capital.id)} className="text-left underline decoration-line underline-offset-2 hover:decoration-current">{displayName(capital, lang)}</button>]] as [string, ReactNode][])
            : []),
          ...(seat
            ? ([
                [tl("seat", lang), <button key="s" onClick={() => select(seat.id)} className="text-left underline decoration-line underline-offset-2 hover:decoration-current">{displayName(seat, lang)}</button>],
                [tl("claims", lang), lang === "zh" ? `${displayName(entity, "zh")}全岛及两侧群岛` : `All of ${displayName(entity, "en")} and its offshore islands`],
              ] as [string, ReactNode][])
            : []),
          [
            tl("recognition", lang),
            <span key="r" className="flex items-center gap-2">
              <span className="flex gap-[2px]">
                {Array.from({ length: others }, (_, i) => (
                  <span key={i} className={clsx("h-2.5 w-1 rounded-full", i < facts.recognition ? "bg-emerald-500" : "bg-hover")} />
                ))}
              </span>
              <span className="text-[12px] text-muted">{recognised}</span>
            </span>,
          ],
        ]}
      />
    </Section>
  );
}

/** A chamber whose seats the system hands out: the half circle and its groups. */
function FixedChamberView({ leg, lang }: { leg: FixedChamber; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const view = useMemo(() => {
    const ids = leg.groups.map((_, i) => `g${i}`);
    const data = { entities: Object.fromEntries(leg.groups.map((g, i) => [ids[i], { color: g.color, spectrum: i }])) } as unknown as AtlasData;
    const chamber = {
      seats: leg.seats,
      parties: leg.groups.map((g, i) => ({ id: ids[i], seats: g.seats, vote: 0 })),
      government: [],
      names: leg.names,
    } as unknown as Seating;
    return { data, chamber };
  }, [leg]);
  return (
    <>
      <BodyName name={leg.names[lang]} sub={`${leg.seats} ${t("seatsUnit", lang)}`} />
      <div className="mx-auto max-w-[300px]">
        <Hemicycle data={view.data} chamber={view.chamber} lang={lang} />
      </div>
      <ul className="mt-3 -mx-2">
        {leg.groups.map((g) => {
          const cells = (
            <>
              <span className="size-2.5 rounded-sm" style={{ background: g.color }} />
              <span className="truncate text-ink">{g.names[lang]}</span>
              <span className="text-ink tabular-nums">{g.seats}</span>
              <span className="text-right text-faint tabular-nums">{Math.round((100 * g.seats) / leg.seats)}%</span>
            </>
          );
          const row = "grid w-full grid-cols-[auto_1fr_auto_2.75rem] items-center gap-2 rounded-lg px-2 py-1 text-left text-[12.5px]";
          return (
            <li key={g.names.en}>
              {g.party ? (
                <button onClick={() => select(g.party!)} className={clsx(row, "hover:bg-hover")}>
                  {cells}
                </button>
              ) : (
                <div className={row}>{cells}</div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[12px] text-faint">{leg.notes?.[lang] ?? tl("fixedSeats", lang)}</p>
    </>
  );
}

const Without = ({ text, lang }: { text: Localized; lang: Lang }) => <p className="text-[12.5px] leading-relaxed text-muted">{text[lang]}</p>;

/** A nation without an elected parliament: its government and ministers, the chamber the system fills (or
 * none) and its courts (or none). */
function GovernmentSection({ entity, facts, lang }: { entity: Entity; facts: NationFacts; lang: Lang }) {
  const [open, setOpen] = useCardOpen("ministers");
  const g = entity.government;
  const leg = facts.legislature;
  const ex = g?.executive;
  const ju = g?.judiciary;
  const ministry = (m: Localized) => (lang === "en" ? m.en.replace(/^(Ministry|Department) of (the )?/, "") : m.zh);
  return (
    <Section title={t("politicsTitle", lang)}>
      {ex && (
        <Branch label={t("executive", lang)}>
          {"none" in ex ? (
            <Without text={ex.none} lang={lang} />
          ) : (
            <>
              <BodyName name={ex.names[lang]} sub={ex.ministers.length ? (lang === "zh" ? `${ex.ministers.length} 个部门` : `${ex.ministers.length} departments`) : undefined} />
              {(ex.head || ex.deputy) && <Rows rows={[ex.head, ex.deputy].filter((o) => !!o).map((o) => [o.title[lang], o.name[lang]] as [string, ReactNode])} />}
              {ex.ministers.length > 0 && (
                <>
                  <button
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    className="mt-2 -ml-2 flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
                  >
                    <ChevronDown className={clsx("size-3.5 transition-transform", open && "rotate-180")} />
                    {open ? t("hideMinisters", lang) : `${t("showMinisters", lang)} · ${ex.ministers.length}`}
                  </button>
                  {open && (
                    <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 divide-y divide-line/60">
                      {ex.ministers.map((m) => (
                        <li key={m.ministry.en} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-3 py-1.5 text-[12.5px]">
                          <span className="leading-snug text-muted">{ministry(m.ministry)}</span>
                          <span className="text-ink">{m.name[lang]}</span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </>
              )}
              {ex.notes && <Paragraphs text={ex.notes[lang]} className="mt-2 text-[12.5px] leading-relaxed text-muted" />}
            </>
          )}
        </Branch>
      )}
      {leg && (
        <Branch label={t("legislature", lang)}>{"none" in leg ? <Without text={leg.none} lang={lang} /> : <FixedChamberView leg={leg} lang={lang} />}</Branch>
      )}
      {ju && (
        <Branch label={t("judiciary", lang)}>
          {"none" in ju ? (
            <Without text={ju.none} lang={lang} />
          ) : (
            <>
              <BodyName name={ju.names[lang]} sub={lang === "zh" ? `法官 ${ju.judges.length + 1} 人` : `${ju.judges.length + 1} judges`} />
              <Rows
                rows={[
                  [t("legalSystem", lang), ju.law[lang]],
                  [ju.title[lang], ju.name[lang]],
                  ...(ju.judges.length ? [[t("judges", lang), <span className="leading-relaxed text-ink">{ju.judges.map((j) => j[lang]).join(lang === "zh" ? "、" : ", ")}</span>] as [string, ReactNode]] : []),
                ]}
              />
              {ju.notes && <Paragraphs text={ju.notes[lang]} className="mt-2 text-[12.5px] leading-relaxed text-muted" />}
            </>
          )}
        </Branch>
      )}
    </Section>
  );
}

function RelationsSection({ data, facts, lang }: { data: AtlasData; facts: NationFacts; lang: Lang }) {
  const rows: [keyof typeof L, string[] | undefined, string][] = [
    ["allies", facts.allies, "#10b981"],
    ["rivals", facts.rivals, "#f43f5e"],
    ["backers", facts.backers, "#8b5cf6"],
  ];
  if (!rows.some(([, ids]) => ids?.length)) return null;
  return (
    <Section title={tl("relations", lang)}>
      {rows.map(([key, ids, tone]) =>
        ids?.length ? (
          <Sub key={key} label={tl(key, lang)}>
            <Chips>
              {ids.map((id) => (
                <StateChip key={id} data={data} id={id} lang={lang} tone={tone} />
              ))}
            </Chips>
          </Sub>
        ) : null,
      )}
    </Section>
  );
}

function ArmedForces({ facts, lang, accent }: { facts: NationFacts; lang: Lang; accent: string }) {
  const m = facts.military;
  return (
    <Section title={tl("military", lang)}>
      <div className="mb-3.5 flex items-center gap-3">
        <div className="flex items-end gap-1" aria-label={`${m.strength} / 5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <motion.span
              key={i}
              className="w-2.5 rounded-sm"
              style={{ background: i <= m.strength ? accent : "var(--ui-hover)" }}
              initial={{ height: 0 }}
              animate={{ height: 6 + i * 4 }}
              transition={{ duration: 0.4, delay: 0.05 * i }}
            />
          ))}
        </div>
        <div>
          <div className="text-[11px] text-muted">{tl("strength", lang)}</div>
          <div className="text-[14px] font-semibold text-ink">{STRENGTH[m.strength - 1][lang]}</div>
        </div>
      </div>
      <Rows
        rows={[
          [tl("active", lang), people(m.active, lang)],
          [tl("reserve", lang), people(m.reserve, lang)],
          ...(m.budget_gdp ? ([[tl("budget", lang), `${formatNumber(m.budget_gdp, lang, 1)}%`]] as [string, ReactNode][]) : []),
          [
            tl("branches", lang),
            <span key="b" className="flex flex-wrap gap-1">
              {m.branches.map((b) => (
                <span key={b.en} className="rounded-md bg-hover px-1.5 py-px text-[12px]">
                  {b[lang]}
                </span>
              ))}
            </span>,
          ],
          [tl("equipment", lang), m.equipment[lang]],
        ]}
      />
    </Section>
  );
}

function WarsSection({ facts, lang }: { facts: NationFacts; lang: Lang }) {
  if (!facts.wars?.length) return null;
  return (
    <Section title={tl("wars", lang)}>
      <ul className="space-y-2">
        {facts.wars.map((w) => (
          <li key={w.names.en} className="rounded-xl border border-line px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="flex-1 text-[13px] font-medium text-ink">{w.names[lang]}</span>
              <span className={clsx("shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold", WAR_STATUS[w.status].className)}>
                {WAR_STATUS[w.status].label[lang]}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted">{w.role[lang]}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border px-3 py-2" style={{ borderColor: `color-mix(in srgb, ${tone} 25%, transparent)`, background: `color-mix(in srgb, ${tone} 7%, transparent)` }}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-[17px] font-semibold text-ink tabular-nums">{value}</div>
    </div>
  );
}

function RefugeeSection({ facts, lang }: { facts: NationFacts; lang: Lang }) {
  const r = facts.refugees;
  return (
    <Section title={tl("refugees", lang)}>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={tl("hosted", lang)} value={people(r.hosted, lang)} tone="#0ea5e9" />
        <Tile label={tl("abroad", lang)} value={people(r.abroad, lang)} tone="#f59e0b" />
      </div>
    </Section>
  );
}

function ReligionSection({ facts, lang, accent }: { facts: NationFacts; lang: Lang; accent: string }) {
  const parts = [...facts.religion].sort((a, b) => b.share - a.share);
  const color = (p: (typeof parts)[number], i: number) => p.color ?? `color-mix(in srgb, ${accent} ${[100, 62, 36, 20][i % 4]}%, var(--ui-hover))`;
  return (
    <Section title={tl("religion", lang)}>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <motion.span
            key={p.names.en}
            className="h-full"
            style={{ background: color(p, i) }}
            initial={{ width: 0 }}
            animate={{ width: `${p.share}%` }}
            transition={{ duration: 0.6, delay: 0.05 * i, ease: "easeOut" }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {parts.map((p, i) => (
          <span key={p.names.en} className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full" style={{ background: color(p, i) }} />
            {p.names[lang]}
            <span className="text-ink tabular-nums">{p.share}%</span>
          </span>
        ))}
      </div>
    </Section>
  );
}

const freedomTone = (v: number) => (v < 30 ? "#f43f5e" : v < 60 ? "#f59e0b" : "#10b981");

function FreedomSection({ facts, lang }: { facts: NationFacts; lang: Lang }) {
  const keys = ["political", "civil", "press", "economic"] as const;
  const fr = facts.freedom;
  if (!fr) return null;
  return (
    <Section title={tl("freedom", lang)}>
      <div className="space-y-1.5">
        {keys.map((k, i) => {
          const v = fr[k];
          return (
            <div key={k} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2.5 text-[12px]">
              <span className="truncate text-muted">{tl(k, lang)}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-hover">
                <motion.span
                  className="block h-full rounded-full"
                  style={{ background: freedomTone(v) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${v}%` }}
                  transition={{ duration: 0.6, delay: 0.05 * i, ease: "easeOut" }}
                />
              </span>
              <span className="text-right text-ink tabular-nums">{v}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-faint">{tl("freedomNote", lang)}</p>
    </Section>
  );
}

function SymbolsSection({ facts, lang }: { facts: NationFacts; lang: Lang }) {
  const s = facts.symbols;
  return (
    <Section title={tl("national", lang)}>
      <Rows
        rows={[
          [tl("anthem", lang), s.anthem[lang]],
          [tl("flower", lang), s.flower[lang]],
          [tl("animal", lang), s.animal[lang]],
        ]}
      />
    </Section>
  );
}

function FactsSection({ facts, lang }: { facts: NationFacts; lang: Lang }) {
  const f = facts.facts;
  return (
    <Section title={tl("facts", lang)}>
      <Rows
        rows={[
          [tl("currency", lang), `${f.currency[lang]} (${f.currency_code})`],
          [tl("timeZone", lang), f.time_zone],
          [tl("callingCode", lang), f.calling_code],
          [tl("tld", lang), <span key="t" className="font-mono text-[12.5px]">{f.tld}</span>],
          [tl("driving", lang), tl(f.driving, lang)],
        ]}
      />
    </Section>
  );
}

/** Parts of the default card a grouped card reuses, placed in its groups. */
export type SharedParts = {
  about: ReactNode;
  legislature: ReactNode;
  people: ReactNode;
  economy: ReactNode;
  climate: ReactNode;
  children: ReactNode;
  backed: ReactNode;
  flag: ReactNode;
  lineage: ReactNode;
  codes: ReactNode;
  party: (part: PartyPart) => ReactNode;
};

/** Long cards (countries, territories, nations, blocs, parties) come in groups with jumps; short ones are one column. */
export function isGroupedCard(e: Entity) {
  return !!e.nation || e.kind === "bloc" || e.kind === "party" || (e.kind === "division" && (e.subtype === "dependency" || e.subtype === "country"));
}

/** A territory's or country's groups, in the order a nation's card uses, without the groups it has nothing for. */
function divisionGroups(entity: Entity, lang: Lang, shared: SharedParts): GroupDef[] {
  return [
    { key: "overview", title: tl("groupOverview", lang), body: shared.about, show: !!(entity.notes || entity.background) },
    { key: "politics", title: tl("groupPolitics", lang), body: shared.legislature, show: !!entity.legislature },
    { key: "relations", title: tl("groupRelations", lang), body: shared.backed, show: !!entity.member_nations?.length },
    { key: "society", title: tl("groupSociety", lang), body: shared.people, show: !!entity.demographics },
    { key: "economy", title: tl("groupEconomy", lang), body: shared.economy, show: !!entity.economy },
    {
      key: "geography",
      title: tl("groupGeography", lang),
      body: <>{shared.climate}{shared.children}</>,
      show: !!(entity.climate || entity.climate_notes || entity.children?.length),
    },
    { key: "symbols", title: tl("groupSymbols", lang), body: shared.flag, show: !!entity.flag },
    { key: "facts", title: tl("groupFacts", lang), body: <>{shared.lineage}{shared.codes}</>, show: !!(shared.codes || entity.parent) },
  ];
}

function partyGroups(entity: Entity, lang: Lang, shared: SharedParts): GroupDef[] {
  return [
    { key: "overview", title: tl("groupOverview", lang), body: <>{shared.about}{shared.party("profile")}</> },
    { key: "positions", title: tl("groupPositions", lang), body: shared.party("positions"), show: !!(entity.axes || entity.policies?.length || entity.base || entity.reunification) },
    { key: "organisation", title: tl("groupOrganisation", lang), body: shared.party("organisation"), show: !!(entity.youth_wing || entity.organisation) },
    { key: "seats", title: tl("groupSeats", lang), body: shared.party("seats") },
    { key: "symbols", title: tl("groupSymbols", lang), body: shared.flag, show: !!entity.flag },
    { key: "history", title: tl("groupHistory", lang), body: shared.party("history"), show: !!(entity.history || entity.allies?.length || entity.backers?.length) },
  ];
}

export function CardGroups({ data, entity, lang, accent, shared }: { data: AtlasData; entity: Entity; lang: Lang; accent: string; shared: SharedParts }) {
  const groups = useMemo<GroupDef[]>(() => {
    const f = entity.nation;
    if (!f) {
      if (entity.kind === "bloc") return blocGroups(data, entity, lang, accent, shared);
      if (entity.kind === "party") return partyGroups(entity, lang, shared);
      return divisionGroups(entity, lang, shared);
    }
    return [
      { key: "overview", title: tl("groupOverview", lang), body: <><IdentitySection data={data} entity={entity} facts={f} lang={lang} />{shared.about}</> },
      {
        key: "politics",
        title: tl("groupPolitics", lang),
        body: (
          <>
            {entity.legislature ? shared.legislature : <GovernmentSection entity={entity} facts={f} lang={lang} />}
            <RelationsSection data={data} facts={f} lang={lang} />
          </>
        ),
      },
      {
        key: "military",
        title: tl("groupMilitary", lang),
        body: (
          <>
            <ArmedForces facts={f} lang={lang} accent={accent} />
            <WarsSection facts={f} lang={lang} />
            <RefugeeSection facts={f} lang={lang} />
          </>
        ),
      },
      {
        key: "society",
        title: tl("groupSociety", lang),
        body: (
          <>
            <ReligionSection facts={f} lang={lang} accent={accent} />
            <FreedomSection facts={f} lang={lang} />
            {shared.people}
          </>
        ),
      },
      { key: "economy", title: tl("groupEconomy", lang), body: shared.economy },
      { key: "geography", title: tl("groupGeography", lang), body: <>{shared.climate}{shared.children}</> },
      { key: "symbols", title: tl("groupSymbols", lang), body: <>{shared.flag}<SymbolsSection facts={f} lang={lang} /></> },
      { key: "facts", title: tl("groupFacts", lang), body: <><FactsSection facts={f} lang={lang} />{shared.lineage}{shared.codes}</> },
    ];
  }, [data, entity, lang, accent, shared]);
  return <Groups groups={groups} accent={accent} />;
}

function MemberList({ data, ids, leader, lang }: { data: AtlasData; ids: string[]; leader?: string; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const members = ids
    .map((id) => data.entities[id])
    .filter((e): e is Entity => !!e)
    .sort((a, b) => Number(b.id === leader) - Number(a.id === leader) || (b.population ?? 0) - (a.population ?? 0));
  const max = Math.max(...members.map((m) => m.population ?? 0), 1);
  return (
    <ul className="-mx-2 space-y-0.5">
      {members.map((m) => (
        <li key={m.id}>
          <button onClick={() => select(m.id)} className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover">
            <div className="flex items-center gap-2">
              {hasEmblem(m) && <Emblem entity={m} size={22} className="-my-0.5 shrink-0 transition-transform group-hover:scale-110" />}
              <span className="flex-1 truncate text-[13px] text-ink">{displayName(m, lang)}</span>
              {m.nation?.bloc_role && <span className="shrink-0 text-[11px] text-faint">{m.nation.bloc_role[lang]}</span>}
              {m.population ? <span className="text-[12px] text-muted tabular-nums">{formatPopulation(m.population, lang)}</span> : null}
            </div>
            {m.population ? (
              <div className="mt-1 ml-[30px] h-1 overflow-hidden rounded-full bg-hover">
                <div className="h-full rounded-full opacity-80" style={{ width: `${(100 * m.population) / max}%`, background: m.color }} />
              </div>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function blocGroups(data: AtlasData, entity: Entity, lang: Lang, accent: string, shared: SharedParts): GroupDef[] {
  const ids = entity.member_nations ?? [];
  const members = ids.map((id) => data.entities[id]).filter((e): e is Entity => !!e);
  const area = members.reduce((a, m) => a + (m.area_km2 ?? 0), 0);
  const troops = members.reduce((a, m) => a + (m.nation?.military.active ?? 0), 0);
  const leader = entity.leader_nation ? data.entities[entity.leader_nation] : undefined;
  return [
    {
      key: "overview",
      title: tl("groupOverview", lang),
      body: (
        <>
          <Section title={tl("doctrine", lang)}>
            <div className="grid grid-cols-3 gap-2">
              <Tile label={tl("memberCount", lang)} value={String(members.length)} tone={accent} />
              <Tile label={t("area", lang)} value={`${formatNumber(Math.round(area / 1000), lang)}k km²`} tone={accent} />
              <Tile label={tl("troops", lang)} value={formatPopulation(troops, lang)} tone={accent} />
            </div>
            {entity.doctrine && <p className="mt-3 text-[13.5px] leading-relaxed text-ink">{entity.doctrine[lang]}</p>}
            {entity.motto && (
              <p className="mt-2 text-[13px] text-muted">
                {t("motto", lang)} · <span className="italic text-ink">{entity.motto[lang]}</span>
              </p>
            )}
            {leader && (
              <div className="mt-3 flex items-center gap-2 text-[13px]">
                <span className="text-muted">{tl("leaderNation", lang)}</span>
                <StateChip data={data} id={leader.id} lang={lang} tone={accent} />
              </div>
            )}
          </Section>
          {shared.about}
        </>
      ),
    },
    {
      key: "members",
      title: `${tl("groupMembers", lang)} · ${members.length}`,
      body: (
        <Section title={tl("memberCount", lang)}>
          <MemberList data={data} ids={ids} leader={entity.leader_nation} lang={lang} />
        </Section>
      ),
    },
  ];
}

/** Countries: the island nations they back, grouped by bloc. */
export function BackedSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const ids = entity.kind === "division" && !entity.role ? (entity.member_nations ?? []) : [];
  if (!ids.length) return null;
  const byBloc = new Map<string, string[]>();
  for (const id of ids) {
    const b = data.entities[id]?.nation?.bloc ?? "";
    byBloc.set(b, [...(byBloc.get(b) ?? []), id]);
  }
  return (
    <Section title={tl("backedNations", lang)}>
      <p className="mb-2.5 text-[12px] text-faint">{tl("backedNote", lang)}</p>
      {[...byBloc].map(([b, list]) => {
        const bloc = data.entities[b];
        return (
          <Sub key={b} label={bloc ? displayName(bloc, lang) : tl("neutral", lang)}>
            <Chips>
              {list.map((id) => (
                <StateChip key={id} data={data} id={id} lang={lang} tone={bloc?.color} />
              ))}
            </Chips>
          </Sub>
        );
      })}
    </Section>
  );
}
