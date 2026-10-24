import { useMemo } from "react";
import { useAtlas } from "../store";
import { findRoute, type RouteResult } from "./routing";

export function useRoute(): RouteResult | null {
  const graph = useAtlas((s) => s.data?.graph);
  const { from, to } = useAtlas((s) => s.route);
  return useMemo(() => (graph && from && to ? findRoute(graph, from, to) : null), [graph, from, to]);
}
