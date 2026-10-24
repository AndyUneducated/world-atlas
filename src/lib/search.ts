import type { Entity } from "./types";

interface Doc {
  entity: Entity;
  keys: string[];
  latin: string[];
  weight: number;
}

export interface SearchHit {
  entity: Entity;
  score: number;
}

const KIND_WEIGHT: Record<string, number> = {
  dependency: 30,
  locality: 26,
  borough: 16,
  mountain_range: 14,
  volcano: 13,
  river: 13,
  lake: 13,
  peak: 12,
  glacier: 10,
  pass: 9,
  bay: 12,
  fjord: 12,
  ridge: 11,
  island: 11,
  cape: 9,
  strait: 9,
  estuary: 8,
  motorway: 12,
  arterial: 6,
  secondary: 4,
  collector: 3,
  rail: 10,
  metro: 7,
  airport: 9,
  spaceport: 9,
  port: 8,
  ferry_terminal: 6,
  station: 6,
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\s\-–—·]/g, "");

function isSubsequence(q: string, s: string) {
  let i = 0;
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true;
  return false;
}

type Pinyin = typeof import("pinyin-pro").pinyin;

export class SearchIndex {
  private docs: Doc[];

  /** pinyin-pro carries a large dictionary, so it is loaded on demand. */
  static async create(entities: Entity[]): Promise<SearchIndex> {
    const { pinyin } = await import("pinyin-pro");
    return new SearchIndex(entities, pinyin);
  }

  private constructor(entities: Entity[], pinyin: Pinyin) {
    this.docs = entities
      .filter((e) => e.bbox)
      .map((e) => {
        const syllables = pinyin(e.names.zh, { toneType: "none", type: "array" });
        const latin = [
          e.names.en,
          e.names["art-x-viking"],
          e.names["art-x-buckham"],
          e.short_names?.en,
          syllables.join(""),
          syllables.map((p) => p[0]).join(""),
          e.ref,
        ]
          .filter((x): x is string => !!x)
          .map(norm);
        const keys = [e.names.zh, e.short_names?.zh, e.codes?.admin, e.codes?.unlocode, e.codes?.iso3166_2]
          .filter((x): x is string => !!x)
          .map(norm);
        const weight =
          (KIND_WEIGHT[e.kind === "route" ? (e.class ?? "") : e.subtype] ?? 5) + (e.population ? Math.log10(e.population) : 0);
        return { entity: e, keys: [...keys, ...latin], latin, weight };
      });
  }

  search(query: string, limit = 8): SearchHit[] {
    const q = norm(query.trim());
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      let best = 0;
      for (const k of d.keys) {
        if (k === q) best = Math.max(best, 100);
        else if (k.startsWith(q)) best = Math.max(best, 80 - Math.min(20, k.length - q.length));
        else if (k.includes(q)) best = Math.max(best, 55);
      }
      if (best) hits.push({ entity: d.entity, score: best + d.weight });
    }
    if (!hits.length && q.length >= 3) {
      for (const d of this.docs) if (d.latin.some((k) => isSubsequence(q, k))) hits.push({ entity: d.entity, score: 25 + d.weight });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
