import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GroupTitle, NotApplicable, Paragraphs, Rows, Section, Sub, useCardOpen } from "./CardParts";
import { Emblem, hasEmblem } from "./Emblem";
import { Hemicycle } from "./Hemicycle";
import { BodyName, Branch, OfficeRows, type PartyPart } from "./Politics";
import { islandStates, isRegistryCountry } from "../lib/entity";
import { displayName, formatNumber, formatPopulation, t } from "../lib/i18n";
import type { AtlasData, Entity, Faith, FixedChamber, ForceBranch, Lang, Localized, NationFacts, Seating, WarStatus } from "../lib/types";
import { useAtlas } from "../store";

const L = {
  groupOverview: { zh: "概况", en: "Overview" },
  groupPolitics: { zh: "政府", en: "Government" },
  groupMilitary: { zh: "军事与安全", en: "Military and security" },
  groupSociety: { zh: "人口与社会", en: "People and society" },
  groupEconomy: { zh: "经济", en: "Economy" },
  groupGeography: { zh: "地理", en: "Geography" },
  groupSymbols: { zh: "象征", en: "Symbols" },
  groupFacts: { zh: "基本资料", en: "Basic facts" },
  groupMembers: { zh: "成员", en: "Members" },
  identity: { zh: "国家", en: "State" },
  ideology: { zh: "意识形态", en: "Ideology" },
  government: { zh: "政体", en: "Government" },
  powerHolder: { zh: "实际掌权", en: "Real power" },
  capital: { zh: "首都", en: "Capital" },
  recognition: { zh: "外交承认", en: "Recognition" },
  recognisedBy: { zh: "{n} / {of} 国承认", en: "{n} of {of} states" },
  unrecognised: { zh: "无国家承认", en: "None" },
  bloc: { zh: "阵营", en: "Bloc" },
  neutral: { zh: "中立", en: "Neutral" },
  legislature: { zh: "立法机构", en: "Legislature" },
  elections: { zh: "选举", en: "Elections" },
  fixedSeats: { zh: "议席由制度固定分配，不经竞争性选举", en: "Seats are allotted by the system, not won in contested elections" },
  relations: { zh: "对外关系", en: "Relations" },
  allies: { zh: "盟友", en: "Allies" },
  rivals: { zh: "敌对", en: "Rivals" },
  backers: { zh: "外部支持", en: "Outside backers" },
  military: { zh: "军事力量", en: "Military forces" },
  strength: { zh: "军力等级", en: "Strength" },
  active: { zh: "现役", en: "Active" },
  reserve: { zh: "预备役", en: "Reserve" },
  budget: { zh: "军费开支（占 GDP）", en: "Military expenditure, % of GDP" },
  forces: { zh: "武装力量", en: "Military and security forces" },
  noForces: { zh: "无武装力量", en: "No armed forces" },
  service: { zh: "兵役制度", en: "Military service age and obligation" },
  equipment: { zh: "装备", en: "Equipment" },
  wars: { zh: "战争与冲突", en: "Wars and conflicts" },
  refugees: { zh: "难民", en: "Refugees" },
  hosted: { zh: "境内收容", en: "Hosted" },
  abroad: { zh: "流亡境外", en: "Abroad" },
  religion: { zh: "宗教", en: "Religion" },
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
  countryCallingCode: { zh: "国际电话区号", en: "Country calling code" },
  tld: { zh: "互联网国家代码", en: "Internet country code" },
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
  groupPositions: { zh: "立场与主张", en: "Positions and policies" },
  predecessors: { zh: "历任", en: "Predecessors" },
  emblems: { zh: "标志物", en: "Emblems" },
  culture: { zh: "文化", en: "Culture" },
  holiday: { zh: "主要节日", en: "Main holiday" },
  dish: { zh: "代表菜肴", en: "Signature dish" },
  sport: { zh: "热门运动", en: "Popular sport" },
  travel: { zh: "旅行建议", en: "Travel advice" },
  travel1: { zh: "1 级 · 注意常规安全", en: "Level 1 · Normal precautions" },
  travel2: { zh: "2 级 · 提高警惕", en: "Level 2 · Increased caution" },
  travel3: { zh: "3 级 · 重新考虑行程", en: "Level 3 · Reconsider travel" },
  travel4: { zh: "4 级 · 请勿前往", en: "Level 4 · Do not travel" },
  groupOrganisation: { zh: "组织", en: "Organisation" },
  groupSeats: { zh: "选举与议席", en: "Elections and seats" },
  groupHistory: { zh: "沿革与关系", en: "History and relations" },
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
          <GroupTitle.Provider value={g.title}>{g.body}</GroupTitle.Provider>
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

/** The states that may recognise it: every state on Ranova but itself. */
function otherStates(data: AtlasData, entity: Entity) {
  return islandStates(data).filter((e) => e.id !== entity.id).length;
}

function IdentitySection({ data, entity, facts, lang }: { data: AtlasData; entity: Entity; facts: NationFacts; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const capital = typeof entity.capital === "string" ? data.entities[entity.capital] : undefined;
  const capitalName = entity.capital && typeof entity.capital === "object" ? entity.capital[lang] : undefined;
  const others = otherStates(data, entity);
  const uncontrolled = entity.uncontrolled?.includes("capital") && <span className="text-muted">{t("uncontrolled", lang)}</span>;
  const recognised = facts.recognition
    ? tl("recognisedBy", lang).replace("{n}", String(facts.recognition)).replace("{of}", String(others))
    : tl("unrecognised", lang);
  return (
    <Section>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {/* a country stands outside the islands' blocs, not neutral among them */}
        {(facts.bloc || !isRegistryCountry(entity)) && <BlocBadge data={data} facts={facts} lang={lang} />}
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
          ...(facts.heir ? ([[facts.heir.title[lang], facts.heir.name[lang]]] as [string, ReactNode][]) : []),
          ...(facts.predecessors?.length
            ? ([
                [
                  tl("predecessors", lang),
                  <ul key="p" className="space-y-1">
                    {facts.predecessors.map((p) => (
                      <li key={p.name.en} className="leading-snug">
                        <span className="text-ink">{p.name[lang]}</span>
                        <span className="text-muted"> · {p.title[lang]}</span>
                        {p.note && <span className="block text-[12px] text-muted">{p.note[lang]}</span>}
                      </li>
                    ))}
                  </ul>,
                ],
              ] as [string, ReactNode][])
            : []),
          [tl("powerHolder", lang), facts.power[lang]],
          ...(capital
            ? ([
                [
                  tl("capital", lang),
                  <span key="c">
                    <button onClick={() => select(capital.id)} className="text-left underline decoration-line underline-offset-2 hover:decoration-current">{displayName(capital, lang)}</button>
                    {uncontrolled}
                  </span>,
                ],
              ] as [string, ReactNode][])
            : capitalName
              ? ([[tl("capital", lang), <span key="c">{capitalName}{uncontrolled}</span>]] as [string, ReactNode][])
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
    <Section title={t("politicsTitle", lang)} flat>
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
      {entity.offices?.length ? (
        <Branch label={t("keyOffices", lang)}>
          <OfficeRows list={entity.offices} lang={lang} />
        </Branch>
      ) : null}
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

/** Generic service branches (the forces' own names are proper nouns in the data). */
const FORCE_BRANCH: Record<ForceBranch, { zh: string; en: string }> = {
  army: { zh: "陆军", en: "Army" },
  navy: { zh: "海军", en: "Navy" },
  air_force: { zh: "空军", en: "Air Force" },
  marines: { zh: "海军陆战队", en: "Marines" },
  coast_guard: { zh: "海岸警卫队", en: "Coast Guard" },
  air_defence: { zh: "防空部队", en: "Air Defence" },
  special_forces: { zh: "特种部队", en: "Special Forces" },
  gendarmerie: { zh: "宪兵", en: "Gendarmerie" },
  border_guard: { zh: "边防部队", en: "Border Guard" },
  paramilitary: { zh: "准军事部队", en: "Paramilitary" },
  militia: { zh: "民兵", en: "Militia" },
  guard: { zh: "警卫部队", en: "Guard" },
  peacekeepers: { zh: "维和部队", en: "Peacekeepers" },
  private_military: { zh: "私营军事部队", en: "Private Military" },
  police: { zh: "警察", en: "Police" },
  rocket_force: { zh: "火箭军", en: "Rocket Force" },
  space_force: { zh: "太空军", en: "Space Force" },
  cyber_force: { zh: "网络空间部队", en: "Cyberspace Force" },
};

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
          ...(m.service ? ([[tl("service", lang), m.service[lang]]] as [string, ReactNode][]) : []),
          [
            tl("forces", lang),
            m.forces.length ? (
              <span key="f" className="flex flex-col gap-1.5">
                {m.forces.map((f) => (
                  <span key={f.names.en} className="flex flex-col gap-1">
                    <span className="font-medium text-ink">{f.names[lang]}</span>
                    <span className="flex flex-wrap gap-1">
                      {f.branches.map((b) => (
                        <span key={b} className="rounded-md bg-hover px-1.5 py-px text-[12px]">
                          {FORCE_BRANCH[b][lang]}
                        </span>
                      ))}
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              tl("noForces", lang)
            ),
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

function ReligionSection({ religion, lang, accent }: { religion: Faith[]; lang: Lang; accent: string }) {
  const parts = [...religion].sort((a, b) => b.share - a.share);
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

function CultureSection({ facts, lang }: { facts: NationFacts; lang: Lang }) {
  const c = facts.culture;
  const keys = (["holiday", "dish", "sport"] as const).filter((k) => c?.[k]);
  if (!c || !keys.length) return null;
  return (
    <Section title={tl("culture", lang)}>
      <Rows rows={keys.map((k) => [tl(k, lang), c[k]![lang]] as [string, ReactNode])} />
    </Section>
  );
}

const TRAVEL_TONES = ["#10b981", "#f59e0b", "#f97316", "#f43f5e"];

function TravelSection({ facts, lang }: { facts: NationFacts; lang: Lang }) {
  const tr = facts.travel;
  if (!tr) return null;
  const tone = TRAVEL_TONES[tr.level - 1];
  return (
    <Section title={tl("travel", lang)}>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium"
        style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
      >
        <span className="size-2 rounded-full" style={{ background: tone }} />
        {tl(`travel${tr.level}`, lang)}
      </span>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{tr.note[lang]}</p>
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
          [tl("countryCallingCode", lang), f.calling_code],
          [tl("tld", lang), <span key="t" className="font-mono text-[12.5px]">{f.tld}</span>],
          [tl("driving", lang), tl(f.driving, lang)],
        ]}
      />
    </Section>
  );
}

const SYMBOL_KEYS = ["anthem", "flower", "tree", "animal", "bird"] as const;
const SYMBOL_NAMES: Record<(typeof SYMBOL_KEYS)[number], Localized> = {
  anthem: { zh: "歌", en: "anthem" },
  flower: { zh: "花", en: "flower" },
  tree: { zh: "树", en: "tree" },
  animal: { zh: "动物", en: "animal" },
  bird: { zh: "鸟", en: "bird" },
};

/** A territory's or city's emblems, named as such places name them: 区花 in a Chinese territory, 州花 in a
 * state, 市花 in a city. */
export function LocalSymbolsSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const s = entity.symbols;
  if (!s) return null;
  const level: Localized =
    entity.subtype !== "dependency" ? { zh: "市", en: "City" } : entity.parent === "country:US" ? { zh: "州", en: "State" } : { zh: "区", en: "Territorial" };
  return (
    <Section title={tl("emblems", lang)}>
      <Rows rows={SYMBOL_KEYS.filter((k) => s[k]).map((k) => [lang === "zh" ? level.zh + SYMBOL_NAMES[k].zh : `${level.en} ${SYMBOL_NAMES[k].en}`, s[k]![lang]] as [string, ReactNode])} />
    </Section>
  );
}

function LocalFactsSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const f = entity.facts;
  if (!f) return null;
  return (
    <Section title={tl("facts", lang)}>
      <Rows
        rows={[
          ...(f.time_zone ? [[tl("timeZone", lang), f.time_zone] as [string, ReactNode]] : []),
          ...(f.calling_code ? [[tl("callingCode", lang), f.calling_code] as [string, ReactNode]] : []),
          ...(f.driving ? [[tl("driving", lang), tl(f.driving, lang)] as [string, ReactNode]] : []),
        ]}
      />
    </Section>
  );
}

/** Parts of the default card a grouped card reuses, placed in its groups. */
type SharedParts = {
  about: ReactNode;
  legislature: ReactNode;
  council: ReactNode;
  election: ReactNode;
  people: ReactNode;
  economy: ReactNode;
  climate: ReactNode;
  children: ReactNode;
  backed: ReactNode;
  flag: ReactNode;
  lineage: ReactNode;
  codes: ReactNode;
  parties: ReactNode;
  party: (part: PartyPart) => ReactNode;
};

/** Every administrative division (country, territory, city, district), bloc and party comes in groups with jumps, in
 * the same order and with the same two heading levels; places and routes are one column. */
export function isGroupedCard(e: Entity) {
  return !!e.nation || e.kind === "bloc" || e.kind === "party" || e.kind === "division";
}

/** A territory's, city's or district's groups, in the order a nation's card uses (CIA World Factbook), without the
 * groups it has nothing for; cities and districts have no military and security group. */
function divisionGroups(entity: Entity, lang: Lang, accent: string, shared: SharedParts): GroupDef[] {
  return [
    { key: "overview", title: tl("groupOverview", lang), body: shared.about, show: !!(entity.notes || entity.background) },
    {
      key: "politics",
      title: tl("groupPolitics", lang),
      body: <>{shared.legislature}{shared.council}{shared.election}{shared.parties}{shared.children}</>,
      show: !!(entity.legislature || entity.council || entity.election || entity.children?.length),
    },
    {
      key: "society",
      title: tl("groupSociety", lang),
      body: <>{entity.religion && <ReligionSection religion={entity.religion} lang={lang} accent={accent} />}{shared.people}</>,
      show: !!(entity.demographics || entity.religion),
    },
    { key: "economy", title: tl("groupEconomy", lang), body: shared.economy, show: !!entity.economy },
    { key: "geography", title: tl("groupGeography", lang), body: shared.climate, show: !!(entity.climate || entity.climate_notes) },
    { key: "symbols", title: tl("groupSymbols", lang), body: <>{shared.flag}<LocalSymbolsSection entity={entity} lang={lang} /></>, show: !!(entity.flag || entity.symbols) },
    {
      key: "facts",
      title: tl("groupFacts", lang),
      body: <><LocalFactsSection entity={entity} lang={lang} />{shared.lineage}{shared.codes}</>,
      show: !!(shared.codes || entity.parent || entity.facts),
    },
  ];
}

function partyGroups(entity: Entity, lang: Lang, shared: SharedParts): GroupDef[] {
  return [
    { key: "overview", title: tl("groupOverview", lang), body: <>{shared.party("profile")}{shared.about}</> },
    { key: "positions", title: tl("groupPositions", lang), body: shared.party("positions"), show: !!(entity.axes || entity.policies?.length || entity.base || entity.reunification) },
    { key: "seats", title: tl("groupSeats", lang), body: shared.party("seats") },
    { key: "organisation", title: tl("groupOrganisation", lang), body: shared.party("organisation"), show: !!(entity.youth_wing || entity.organisation || entity.factions?.length || (entity.branches?.length ?? 0) > 1) },
    { key: "history", title: tl("groupHistory", lang), body: shared.party("history"), show: !!(entity.history || entity.allies?.length || entity.backers?.length) },
    { key: "symbols", title: tl("groupSymbols", lang), body: shared.flag, show: !!entity.flag },
    { key: "facts", title: tl("groupFacts", lang), body: shared.party("facts"), show: !!(entity.hq || entity.members) },
  ];
}

export function CardGroups({ data, entity, lang, accent, shared }: { data: AtlasData; entity: Entity; lang: Lang; accent: string; shared: SharedParts }) {
  const groups = useMemo<GroupDef[]>(() => {
    const f = entity.nation;
    if (!f) {
      if (entity.kind === "bloc") return blocGroups(data, entity, lang, accent, shared);
      if (entity.kind === "party") return partyGroups(entity, lang, shared);
      return divisionGroups(entity, lang, accent, shared);
    }
    return [
      { key: "overview", title: tl("groupOverview", lang), body: <><IdentitySection data={data} entity={entity} facts={f} lang={lang} />{shared.about}</> },
      {
        key: "politics",
        title: tl("groupPolitics", lang),
        body: (
          <>
            {entity.legislature ? shared.legislature : <GovernmentSection entity={entity} facts={f} lang={lang} />}
            <NotApplicable entity={entity} field="elections" title={tl("elections", lang)} lang={lang} />
            {shared.parties}
            <RelationsSection data={data} facts={f} lang={lang} />
            {shared.backed}
            {shared.children}
          </>
        ),
      },
      {
        key: "society",
        title: tl("groupSociety", lang),
        body: (
          <>
            <ReligionSection religion={f.religion} lang={lang} accent={accent} />
            <FreedomSection facts={f} lang={lang} />
            <CultureSection facts={f} lang={lang} />
            {shared.people}
            <RefugeeSection facts={f} lang={lang} />
          </>
        ),
      },
      { key: "economy", title: tl("groupEconomy", lang), body: shared.economy },
      {
        key: "military",
        title: tl("groupMilitary", lang),
        body: (
          <>
            <ArmedForces facts={f} lang={lang} accent={accent} />
            <WarsSection facts={f} lang={lang} />
          </>
        ),
      },
      { key: "geography", title: tl("groupGeography", lang), body: shared.climate },
      { key: "symbols", title: tl("groupSymbols", lang), body: <>{shared.flag}<SymbolsSection facts={f} lang={lang} /></> },
      { key: "facts", title: tl("groupFacts", lang), body: <><FactsSection facts={f} lang={lang} /><TravelSection facts={f} lang={lang} />{shared.lineage}{shared.codes}</> },
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
        <Section>
          <MemberList data={data} ids={ids} leader={entity.leader_nation} lang={lang} />
        </Section>
      ),
    },
  ];
}

/** Countries: the island nations they back, grouped by bloc. */
export function BackedSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const ids = isRegistryCountry(entity) ? (entity.member_nations ?? []) : [];
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
