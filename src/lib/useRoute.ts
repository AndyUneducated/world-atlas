import { useAtlas } from "../store";
import { findRoute, type RouteResult } from "./routing";
import type { RoadGraph } from "./types";

/** The last route found and what it was found for, so the map and the route panel share one search. */
let last: { graph: RoadGraph; from: string; to: string; result: RouteResult | null } | null = null;

export function useRoute(): RouteResult | null {
  const graph = useAtlas((s) => s.data?.graph);
  const { from, to } = useAtlas((s) => s.route);
  if (!graph || !from || !to) return null;
  if (last?.graph !== graph || last.from !== from || last.to !== to) last = { graph, from, to, result: findRoute(graph, from, to) };
  return last.result;
}
