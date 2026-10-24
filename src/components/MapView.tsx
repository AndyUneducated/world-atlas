import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapGeoJSONFeature } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useMemo, useRef } from "react";
import { buildFocus, indexFeatures } from "../lib/focus";
import { buildStyle, HIT_LAYERS, type FocusData } from "../lib/style";
import { THEMES } from "../lib/themes";
import { writeUrl } from "../lib/url";
import { initialView, useAtlas, useCursor } from "../store";

maplibregl.setWorkerUrl(workerUrl);

const CJK_FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif';
const BOROUGH_ZOOM = 8.8;

function drawShield(map: maplibregl.Map, id: string) {
  const [, fill, stroke] = id.split("|");
  const ratio = 2;
  const w = 28 * ratio;
  const h = 20 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const r = 6 * ratio;
  const lw = 1.5 * ratio;
  ctx.beginPath();
  ctx.roundRect(lw / 2, lw / 2, w - lw, h - lw, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  map.addImage(id, ctx.getImageData(0, 0, w, h), {
    pixelRatio: ratio,
    stretchX: [[r, w - r]],
    stretchY: [[r, h - r]],
    content: [r * 0.6, r * 0.5, w - r * 0.6, h - r * 0.5],
  });
}

function syncUrl(map: maplibregl.Map) {
  const s = useAtlas.getState();
  const c = map.getCenter();
  writeUrl({
    sel: s.selectedId ?? undefined,
    theme: s.theme,
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

  const currentFocus = () => focusRef.current ?? buildFocus(features.get(useAtlas.getState().selectedId ?? ""), region.bounds);

  useEffect(() => {
    const s = useAtlas.getState();
    const map = new maplibregl.Map({
      container: container.current!,
      style: buildStyle({ theme: THEMES[s.theme], lang: s.lang, data, layers: s.layers, focus: currentFocus() }),
      ...(initialView
        ? { center: [initialView.lng, initialView.lat], zoom: initialView.zoom, bearing: initialView.bearing }
        : { bounds: region.bounds, fitBoundsOptions: { padding: 80 } }),
      minZoom: 1.2,
      maxZoom: 15,
      maxPitch: 0,
      attributionControl: false,
      localIdeographFontFamily: CJK_FONT,
      fadeDuration: 180,
    });
    mapRef.current = map;

    map.on("styleimagemissing", (e) => {
      if (e.id.startsWith("shield|") && !map.hasImage(e.id)) drawShield(map, e.id);
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
      const order = [HIT_LAYERS.road, HIT_LAYERS.city, HIT_LAYERS.river, HIT_LAYERS.lake, HIT_LAYERS.ridge, HIT_LAYERS.division];
      const hits = map.queryRenderedFeatures(point, { layers: order.filter((l) => map.getLayer(l)) });
      for (const layer of order) {
        const f = hits.find((h) => h.layer.id === layer);
        if (f) return { layer, id: layer === HIT_LAYERS.division ? pickDivision(f) : (f.properties as { id: string }).id };
      }
      return null;
    };

    map.on("click", (e) => {
      const hit = queryHit(e.point);
      useAtlas.getState().select(hit?.id ?? null);
    });

    map.on("mousemove", (e) => {
      useCursor.getState().set({ lngLat: [e.lngLat.lng, e.lngLat.lat] });
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
    map.setStyle(buildStyle({ theme: THEMES[theme], lang, data, layers, focus: currentFocus() }), { diff: true });
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
      const wide = window.innerWidth >= 768;
      map.fitBounds(entity.bbox, {
        padding: wide
          ? { left: 460, top: 90, right: 100, bottom: 90 }
          : { left: 30, top: 110, right: 30, bottom: Math.round(window.innerHeight * 0.5) },
        maxZoom: entity.kind === "division" && entity.subtype === "borough" ? 11 : 10.5,
        duration: 1200,
        essential: true,
      });
    }
    syncUrl(map);
  }, [selectedId, nonce, features, data, region.bounds]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map" />
    </div>
  );
}
