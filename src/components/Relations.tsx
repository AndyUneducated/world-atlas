import { useMemo } from "react";
import { Section } from "./CardParts";
import { accentColor } from "../lib/entity";
import { displayName, formatNumber, t } from "../lib/i18n";
import { useAtlas } from "../store";
import type { AtlasData, Entity, Lang } from "../lib/types";

/** What a street, a city road or a station meets (M137): built from the entity's own data and its neighbours',
 * for the cards that have no hand-written text. */

const STREETS = new Set(["arterial_street", "collector_street"]);
const NEARBY_KM = 1;
const NEARBY_MAX = 6;

const isStreet = (e: Entity) => e.kind === "route" && STREETS.has(e.network ?? "");
const isCityRoad = (e: Entity) => e.kind === "route" && e.network === "municipal_road";
const isStation = (e: Entity) => e.subtype === "station";

export const hasRelations = (e: Entity) => isStreet(e) || isCityRoad(e) || isStation(e);

function names(data: AtlasData, ids: string[] | undefined, lang: Lang): string[] {
  return (ids ?? []).map((id) => data.entities[id]).filter(Boolean).map((e) => displayName(e, lang));
}

function list(items: string[], lang: Lang): string {
  if (lang === "zh") return items.join("、");
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** An English name that reads with "the": the Arctic Ocean Territory, the Kingdom of Miraka. */
function the(name: string) {
  return /^(the|The) /.test(name) || !/\b(Territory|Republic|Kingdom|Realm|Commune|Federation|Union|Islands|State|Commonwealth|Government)\b/.test(name)
    ? name
    : `the ${name}`;
}

function km(e: Entity, lang: Lang) {
  return formatNumber(e.stats?.length_km ?? 0, lang, 1);
}

/** One sentence for a card without hand-written text, from the data the card shows; null for other cards. */
export function relationSummary(data: AtlasData, e: Entity, lang: Lang): string | null {
  const name = displayName(e, lang);
  const zh = lang === "zh";
  if (isStreet(e)) {
    const city = data.entities[e.ancestors?.[0] ?? ""];
    const through = names(data, e.via, lang);
    const n = e.crosses?.length ?? 0;
    const along = names(data, e.along?.slice(0, 3), lang);
    const more = (e.along?.length ?? 0) - along.length;
    const arterial = e.network === "arterial_street";
    if (zh)
      return (
        `${name}是${city ? displayName(city, lang) : ""}的一条城市${arterial ? "主干道" : "次干道"}，全长约 ${km(e, lang)} 公里，经过${list(through, lang)}` +
        (n ? `，沿途与 ${n} 条街道相交` : "") +
        (along.length ? `，沿街有${list(along, lang)}${more > 0 ? `等 ${along.length + more} 处地标` : ""}` : "") +
        "。"
      );
    return (
      `${name} is ${arterial ? "an arterial" : "a collector"} street in ${city ? the(displayName(city, lang)) : "the city"}, about ${km(e, lang)} km long, ` +
      `running through ${list(through, lang)}` +
      (n ? `; it crosses ${n} named street${n > 1 ? "s" : ""}` : "") +
      (along.length ? `${n ? " and" : ";"} passes ${list(along, lang)}${more > 0 ? ` and ${more} other landmark${more > 1 ? "s" : ""}` : ""}` : "") +
      "."
    );
  }
  if (isCityRoad(e)) {
    const owner = data.entities[e.ancestors?.[0] ?? ""];
    const via = names(data, e.via, lang);
    const n = e.crosses?.length ?? 0;
    const route = zh
      ? via.length === 2 ? `连接${via[0]}和${via[1]}` : `途经${list(via, lang)}`
      : via.length === 2 ? `linking ${via[0]} and ${via[1]}` : `running through ${list(via, lang)}`;
    if (zh) return `${name}是${owner ? displayName(owner, lang) : ""}的一条城市公路，全长约 ${km(e, lang)} 公里，${route}${n ? `，沿途与 ${n} 条道路相交` : ""}。`;
    return `${name} is a city road in ${owner ? the(displayName(owner, lang)) : "the territory"}, about ${km(e, lang)} km long, ${route}${n ? `, meeting ${n} other road${n > 1 ? "s" : ""}` : ""}.`;
  }
  if (isStation(e)) {
    const lines = names(data, e.lines, lang);
    if (!lines.length) return null;
    const where = (e.ancestors ?? []).slice(0, 2).map((id) => data.entities[id]).filter(Boolean);
    const place = zh ? where.map((w) => displayName(w, lang)).reverse().join("") : where.map((w) => displayName(w, lang)).join(", ");
    const interchange = lines.length > 1;
    if (zh) return `${name}是${list(lines, lang)}的${interchange ? "换乘站" : "车站"}，位于${place}。`;
    return `${name} is ${interchange ? "an interchange on" : "a station on"} ${list(lines, lang)}, in ${place}.`;
  }
  return null;
}

function Pills({ ids, data, lang }: { ids: string[]; data: AtlasData; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const items = ids.map((id) => data.entities[id]).filter((e): e is Entity => !!e);
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((e) => (
        <button
          key={e.id}
          onClick={() => select(e.id)}
          className="rounded-full border border-line px-2.5 py-0.5 text-left text-[12.5px] leading-snug text-ink transition-colors hover:bg-hover"
        >
          {displayName(e, lang)}
        </button>
      ))}
    </div>
  );
}

/** The neighbouring stops on each line through a station, from the line's own stop order. */
function Neighbours({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const rows = (entity.lines ?? [])
    .map((id) => data.entities[id])
    .filter((l): l is Entity => !!l?.via?.includes(entity.id))
    .map((line) => {
      const via = line.via!;
      const i = via.indexOf(entity.id);
      const at = (k: number) => (line.ring ? via[(k + via.length) % via.length] : via[k]);
      const prev = i > 0 || line.ring ? at(i - 1) : undefined;
      const next = i < via.length - 1 || line.ring ? at(i + 1) : undefined;
      return { line, prev: prev && prev !== entity.id ? data.entities[prev] : undefined, next: next && next !== entity.id ? data.entities[next] : undefined };
    });
  if (!rows.length) return null;
  const stop = (e: Entity | undefined, arrow: "prev" | "next") =>
    e ? (
      <button onClick={() => select(e.id)} className="min-w-0 rounded-lg px-1.5 py-0.5 text-left text-[12.5px] leading-snug break-words text-ink hover:bg-hover">
        {arrow === "prev" ? `‹ ${displayName(e, lang)}` : `${displayName(e, lang)} ›`}
      </button>
    ) : (
      <span className="px-1.5 py-0.5 text-[12px] text-faint">{t("terminus", lang)}</span>
    );
  return (
    <Section title={t("neighbours", lang)}>
      <ul className="space-y-2">
        {rows.map(({ line, prev, next }) => (
          <li key={line.id}>
            <button onClick={() => select(line.id)} className="flex items-center gap-2 text-left text-[12px] font-medium text-muted hover:text-ink">
              <span className="h-1.5 w-3 shrink-0 rounded-full" style={{ background: accentColor(data, line) ?? "var(--ui-accent)" }} />
              {displayName(line, lang)}
            </button>
            <div className="mt-0.5 -ml-1.5 flex flex-wrap items-center justify-between gap-x-2">
              {stop(prev, "prev")}
              {stop(next, "next")}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function distanceKm(a: [number, number], b: [number, number]) {
  const kx = 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111.32);
}

/** Places within a kilometre of a station, nearest first. */
function useNearby(data: AtlasData, entity: Entity): string[] {
  return useMemo(() => {
    const c = entity.center;
    if (!isStation(entity) || !c) return [];
    const out: [number, string][] = [];
    for (const e of Object.values(data.entities)) {
      if (e.kind !== "place" || isStation(e) || !e.center) continue;
      const d = distanceKm(c as [number, number], e.center as [number, number]);
      if (d <= NEARBY_KM) out.push([d, e.id]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, NEARBY_MAX).map(([, id]) => id);
  }, [data, entity]);
}

export function RelationsSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const nearby = useNearby(data, entity);
  if (!hasRelations(entity)) return null;
  const crosses = entity.crosses ?? [];
  const along = entity.along ?? [];
  return (
    <>
      {isStation(entity) && <Neighbours data={data} entity={entity} lang={lang} />}
      {crosses.length > 0 && (
        <Section title={`${t("crossings", lang)} · ${crosses.length}`}>
          <Pills ids={crosses} data={data} lang={lang} />
        </Section>
      )}
      {along.length > 0 && (
        <Section title={`${t("alongWay", lang)} · ${along.length}`}>
          <Pills ids={along} data={data} lang={lang} />
        </Section>
      )}
      {nearby.length > 0 && (
        <Section title={t("nearby", lang)}>
          <Pills ids={nearby} data={data} lang={lang} />
        </Section>
      )}
    </>
  );
}
