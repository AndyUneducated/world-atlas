import type { AtlasData, Chamber, ElectoralSystem, Entity, Lang, Legislature } from "./types";

export const SYSTEM_NAMES: Record<ElectoralSystem, Record<Lang, string>> = {
  mmp: { zh: "混合成员比例制", en: "Mixed-member proportional" },
  fptp: { zh: "单议席选区制", en: "First past the post" },
  pr_reserved: { zh: "比例代表制附保留议席", en: "Proportional, with reserved seats" },
  pr_regional: { zh: "分区比例代表制", en: "Regional proportional" },
};

/** How a parliament is elected, in a sentence or two. */
export function systemText(l: Legislature, lang: Lang): string {
  const th = l.threshold !== undefined ? `${Math.round(l.threshold * 100)}%` : "";
  const zh = lang === "zh";
  switch (l.system) {
    case "mmp": {
      const n = Object.values(l.constituency ?? {}).reduce((a, b) => a + b, 0);
      return zh
        ? `${n} 个选区按人口划分，各选出一名议员；其余议席按政党得票补足，使整个议会与得票成比例。得票达到 ${th} 或赢得选区的政党才参与分配，选区议席多于应得议席时保留为超额议席。`
        : `${n} constituencies drawn by population each elect one member; the other seats are shared out by party vote so that the whole parliament is proportional. A party needs ${th} of the vote or a constituency to take part, and constituency seats beyond its share are kept as overhang seats.`;
    }
    case "fptp":
      return zh
        ? `${l.seats} 个单议席选区按人口划分，每个选区得票最多的候选人当选。这一制度沿用自殖民时代，大党容易赢得多数，小党很难拿到议席。`
        : `${l.seats} single-member constituencies drawn by population each elect the candidate with the most votes. Inherited from colonial times, the system tends to give a big party a majority and leaves small parties few seats.`;
    case "pr_reserved":
      return zh
        ? `${l.seats - (l.reserved ?? 0)} 个议席在全领地按得票比例分配（最高平均数法，依次除以 1、2、3……），门槛为 ${th}；另有 ${l.reserved} 个保留议席，由母语为塔夫鲁纳克语的选民另行选出。`
        : `${l.seats - (l.reserved ?? 0)} seats are shared out across the territory in proportion to the vote (highest averages, dividing by 1, 2, 3 …) with a ${th} threshold; ${l.reserved} more are reserved seats, elected separately by voters whose first language is Tavrunaq.`;
    case "pr_regional":
      return zh
        ? "每座城市是一个选区，按人口分得议席（至少两席），在城市内按得票比例分配（最大余额法），不设门槛。"
        : "Each city is a constituency, with seats by population (at least two) shared out within it in proportion to the vote (largest remainder), with no threshold.";
  }
}

export const isChamber = (c: Entity["council"]): c is Chamber => !!c && !("assembly" in c);

export const majority = (c: Chamber) => Math.floor(c.seats / 2) + 1;

export const governmentSeats = (c: Chamber) => c.parties.filter((p) => c.government.includes(p.id)).reduce((a, p) => a + p.seats, 0);

/** Every party, most seats in the territorial parliaments first. */
export function parties(data: AtlasData): Entity[] {
  const seats = (e: Entity) => (e.seats ?? []).filter((s) => data.entities[s.at]?.subtype === "dependency").reduce((a, s) => a + s.seats, 0);
  return Object.values(data.entities)
    .filter((e) => e.kind === "party")
    .sort((a, b) => seats(b) - seats(a) || (b.members ?? 0) - (a.members ?? 0));
}
