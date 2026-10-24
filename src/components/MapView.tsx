import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapGeoJSONFeature } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Protocol } from "pmtiles";
import { useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { FeatureCollection, Point } from "geojson";
import { cardPadding, homePadding } from "../lib/viewport";
import { PlaceMarker } from "./PlaceMarker";
import { BASE_URL } from "../lib/data";
import { buildFocus, indexFeatures } from "../lib/focus";
import { measureFeatures } from "../lib/measure";
import { useRoute } from "../lib/useRoute";
import { buildStyle, HIT_LAYERS, LANDFORM_LABEL_LAYERS, type FocusData } from "../lib/style";
import { drawShield, shieldImageId } from "../lib/shields";
import { THEMES } from "../lib/themes";
import type { Entity } from "../lib/types";
import { writeUrl } from "../lib/url";
import { initialView, useAtlas, useCursor } from "../store";

maplibregl.setWorkerUrl(workerUrl);
maplibregl.addProtocol("pmtiles", new Protocol().tile);

const CJK_FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif';
const BOROUGH_ZOOM = 8.8;
/** Below this zoom landmark markers would sit on top of the city labels. */
const PLACE_MARKER_ZOOM = 7.5;

function addRouteShield(map: maplibregl.Map, id: string, routes: Map<string, Entity>) {
  const route = routes.get(id.slice(shieldImageId("").length));
  const s = route && drawShield(route, 2);
  if (!s) return;
  map.addImage(id, s.canvas.getContext("2d")!.getImageData(0, 0, s.canvas.width, s.canvas.height), { pixelRatio: s.ratio });
}

/** Summit triangle with a snow cap, or the pass mark ")(" used on topographic maps. */
function drawSymbol(map: maplibregl.Map, id: string) {
  const [kind, color] = id.split("|");
  const ratio = 2;
  const s = 14 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (kind === "peak") {
    const tri = new Path2D();
    tri.moveTo(s / 2, s * 0.14);
    tri.lineTo(s * 0.9, s * 0.84);
    tri.lineTo(s * 0.1, s * 0.84);
    tri.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.6 * ratio;
    ctx.stroke(tri);
    ctx.fill(tri);
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.14);
    ctx.lineTo(s * 0.64, s * 0.38);
    ctx.lineTo(s * 0.36, s * 0.38);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3.4 * ratio;
    const arcs = () => {
      ctx.beginPath();
      ctx.arc(s * 0.08, s / 2, s * 0.34, -0.8, 0.8);
      ctx.moveTo(s * 0.92 + s * 0.34 * Math.cos(Math.PI - 0.8), s / 2 + s * 0.34 * Math.sin(Math.PI - 0.8));
      ctx.arc(s * 0.92, s / 2, s * 0.34, Math.PI - 0.8, Math.PI + 0.8);
      ctx.stroke();
    };
    arcs();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 * ratio;
    arcs();
  }
  map.addImage(id, ctx.getImageData(0, 0, s, s), { pixelRatio: ratio });
}

function syncUrl(map: maplibregl.Map) {
  const s = useAtlas.getState();
  const c = map.getCenter();
  writeUrl({
    sel: s.selectedId ?? undefined,
    lang: s.lang,
    view: { zoom: map.getZoom(), lat: c.lat, lng: c.lng, bearing: map.getBearing() },
  });
}

function metersPerPixel(map: maplibregl.Map) {
  const lat = map.getCenter().lat;
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const focusRef = useRef<FocusData | null>(null);
  const hoverRef = useRef<string | null>(null);
  const styledRef = useRef(false);
  const data = useAtlas((s) => s.data)!;
  const theme = useAtlas((s) => s.theme);
  const lang = useAtlas((s) => s.lang);
  const layers = useAtlas((s) => s.layers);
  const selectedId = useAtlas((s) => s.selectedId);
  const nonce = useAtlas((s) => s.selectionNonce);
  const features = useMemo(() => indexFeatures(data), [data]);
  const region = data.manifest.regions[0];

  const route = useRoute();
  const routeFc: FeatureCollection = useMemo(() => ({ type: "FeatureCollection", features: route ? [route.line] : [] }), [route]);
  const routeRef = useRef(routeFc);
  routeRef.current = routeFc;

  const measure = useAtlas((s) => s.measure);
  const measureFc = () => measureFeatures(useAtlas.getState().measure, null);
  const highlight = useAtlas((s) => s.highlight);
  const highlightFc = (): FeatureCollection => {
    const h = useAtlas.getState().highlight;
    return { type: "FeatureCollection", features: h ? [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: h.lines } }] : [] };
  };
  const styleOpts = () => {
    const s = useAtlas.getState();
    return { theme: THEMES[s.theme], lang: s.lang, data, layers: s.layers, focus: currentFocus(), route: routeRef.current, measure: measureFc(), highlight: highlightFc() };
  };

  const currentFocus = () => focusRef.current ?? buildFocus(features.get(useAtlas.getState().selectedId ?? ""), region.bounds);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: buildStyle(styleOpts()),
      ...(initialView
        ? { center: [initialView.lng, initialView.lat], zoom: initialView.zoom, bearing: initialView.bearing }
        : { bounds: region.bounds, fitBoundsOptions: { padding: homePadding() } }),
      minZoom: 1.2,
      maxZoom: 17,
      maxPitch: 0,
      attributionControl: false,
      localIdeographFontFamily: CJK_FONT,
      fadeDuration: 180,
    });
    mapRef.current = map;

    map.on("error", (e) => {
      const err = e.error as Error & { status?: number; url?: string };
      // A style change while tiles are downloading cancels them, and MapLibre reports the cancelled
      // requests as status-0 fetch failures; the tiles are requested again with the new style.
      if (err?.status === 0 && err.url?.startsWith(BASE_URL)) return;
      console.error(err ?? e);
    });

    const routesByRef = new Map(Object.values(data.entities).filter((e) => e.kind === "route" && e.ref).map((e) => [e.ref!, e]));
    map.setMissingStyleImageResolver((id) => {
      if (map.hasImage(id)) return;
      if (id.startsWith(shieldImageId(""))) addRouteShield(map, id, routesByRef);
      else if (id.startsWith("peak|") || id.startsWith("pass|")) drawSymbol(map, id);
    });

    const readouts = () => {
      const c = map.getCenter();
      useCursor.getState().set({ zoom: map.getZoom(), bearing: map.getBearing(), metersPerPixel: metersPerPixel(map), ...(useCursor.getState().lngLat ? {} : { lngLat: [c.lng, c.lat] }) });
    };
    map.on("move", readouts);
    map.on("load", readouts);

    const pickDivision = (f: MapGeoJSONFeature) => {
      const props = f.properties as { id: string; parent: string };
      const sel = useAtlas.getState().selectedId;
      if (map.getZoom() >= BOROUGH_ZOOM || sel === props.parent || sel === props.id) return props.id;
      return props.parent;
    };

    const queryHit = (point: maplibregl.PointLike) => {
      const order = [HIT_LAYERS.station, HIT_LAYERS.metroStation, HIT_LAYERS.road, HIT_LAYERS.rail, HIT_LAYERS.landmark, HIT_LAYERS.street, HIT_LAYERS.city, ...LANDFORM_LABEL_LAYERS, HIT_LAYERS.river, HIT_LAYERS.lake, HIT_LAYERS.ridge, HIT_LAYERS.division];
      const hits = map.queryRenderedFeatures(point, { layers: order.filter((l) => map.getLayer(l)) });
      for (const layer of order) {
        const f = hits.find((h) => h.layer.id === layer);
        if (f) return { layer, id: layer === HIT_LAYERS.division ? pickDivision(f) : (f.properties as { id: string }).id };
      }
      return null;
    };

    map.on("click", (e) => {
      if ((e.originalEvent.target as HTMLElement | null)?.closest(".atlas-marker")) return;
      const { measure, setMeasure, select } = useAtlas.getState();
      if (measure) {
        setMeasure([...measure, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      const hit = queryHit(e.point);
      select(hit?.id ?? null);
    });

    map.on("mousemove", (e) => {
      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      useCursor.getState().set({ lngLat: cursor });
      const measure = useAtlas.getState().measure;
      if (measure) {
        (map.getSource("measure") as GeoJSONSource | undefined)?.setData(measureFeatures(measure, cursor));
        map.getCanvas().style.cursor = "crosshair";
        return;
      }
      const hit = queryHit(e.point);
      map.getCanvas().style.cursor = hit ? "pointer" : "";
      const hoverId = hit?.layer === HIT_LAYERS.division ? hit.id : null;
      if (hoverId !== hoverRef.current) {
        if (hoverRef.current) map.setFeatureState({ source: "divisions", id: hoverRef.current }, { hover: false });
        if (hoverId) map.setFeatureState({ source: "divisions", id: hoverId }, { hover: true });
        hoverRef.current = hoverId;
      }
    });

    map.on("moveend", () => syncUrl(map));

    useAtlas.getState().setMap(map);
    return () => {
      useAtlas.getState().setMap(null);
      map.remove();
      mapRef.current = null;
      styledRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styledRef.current) {
      styledRef.current = true;
      return;
    }
    map.setStyle(buildStyle(styleOpts()), { diff: true });
    syncUrl(map);
  }, [theme, lang, layers, data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const feature = selectedId ? features.get(selectedId) : undefined;
    const focus = buildFocus(feature, region.bounds);
    focusRef.current = focus;
    const apply = () => {
      (map.getSource("focus-mask") as GeoJSONSource | undefined)?.setData(focus.mask);
      (map.getSource("focus-outline") as GeoJSONSource | undefined)?.setData(focus.outline);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);

    const entity = selectedId ? data.entities[selectedId] : undefined;
    if (entity?.bbox && nonce > 0) {
      map.fitBounds(entity.bbox, {
        padding: cardPadding(),
        maxZoom: entity.subtype === "station" ? 14.5 : entity.kind === "place" ? 15.5 : entity.kind === "division" && entity.subtype === "borough" ? 11 : 10.5,
        duration: 1200,
        essential: true,
      });
    }
    syncUrl(map);
  }, [selectedId, nonce, features, data, region.bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource("route") as GeoJSONSource | undefined)?.setData(routeFc);
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
    const coords = routeFc.features[0]?.geometry.type === "LineString" ? routeFc.features[0].geometry.coordinates : null;
    if (coords?.length) {
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
        padding: cardPadding(),
        duration: 1000,
      });
    }
  }, [routeFc]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource("highlight") as GeoJSONSource | undefined)?.setData(highlightFc());
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [highlight]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = data.layers.places.features
      .filter((f) => (f.properties as { marker?: string }).marker === "emblem" && f.geometry.type === "Point")
      .map((f) => {
        const el = document.createElement("div");
        el.className = "atlas-marker-layer";
        const root = createRoot(el);
        root.render(<PlaceMarker id={(f.properties as { id: string }).id} />);
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat((f.geometry as Point).coordinates as [number, number])
          .addTo(map);
        return { el, root, marker };
      });
    const fade = () => markers.forEach(({ el }) => el.classList.toggle("is-hidden", map.getZoom() < PLACE_MARKER_ZOOM));
    fade();
    map.on("zoom", fade);
    return () => {
      map.off("zoom", fade);
      markers.forEach(({ root, marker }) => {
        marker.remove();
        setTimeout(() => root.unmount());
      });
    };
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource("measure") as GeoJSONSource | undefined)?.setData(measureFeatures(measure, null));
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
    map.getCanvas().style.cursor = measure ? "crosshair" : "";
    if (measure) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [measure]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map" />
    </div>
  );
}
