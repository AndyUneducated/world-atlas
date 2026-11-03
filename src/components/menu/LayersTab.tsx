import clsx from "clsx";
import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { t, type StringKey } from "../../lib/i18n";
import { THEMES, type MapTheme } from "../../lib/themes";
import { useAtlas, type LayerToggles } from "../../store";
import { Switch } from "../Switch";

const GROUPS: { title: StringKey; keys: (keyof LayerToggles)[]; cards?: boolean }[] = [
  { title: "roads", keys: ["nationalExpressway", "territorialExpressway", "territorialHighway", "cityRoads"], cards: true },
  { title: "transit", keys: ["railways", "metro"], cards: true },
  { title: "mapDetails", keys: ["terrain", "landcover", "buildings", "skyways", "boundaries", "choropleth"], cards: true },
];

const bar = (background: string, height = 5): CSSProperties => ({ background, height, top: `calc(50% - ${height / 2}px)` });

/** A thumbnail of how each layer draws: lines across the tile for networks, fills for area layers. */
function swatch(k: keyof LayerToggles, m: MapTheme, layers: LayerToggles): CSSProperties {
  switch (k) {
    case "nationalExpressway":
      return bar(m.nationalExpressway.fill);
    case "territorialExpressway":
      return bar(m.territorialExpressway.fill);
    case "territorialHighway":
      return bar(m.territorialExpressway.fill, 3);
    case "cityRoads":
      return bar(m.cityRoad.fill === "#ffffff" ? m.cityRoad.casing : m.cityRoad.fill);
    case "railways":
      return bar(`repeating-linear-gradient(90deg, ${m.rail.casing} 0 4px, ${m.rail.fill} 4px 7px)`);
    case "metro":
      return bar("linear-gradient(90deg, #E4453A 0 33%, #2F80ED 33% 66%, #F2A33A 66%)");
    case "terrain":
      return { inset: 0, background: `linear-gradient(160deg, ${m.terrain.relief.map(([, c]) => c).slice(1).join(", ")})` };
    case "landcover": {
      const c = m.landcover.colors;
      return { inset: 0, background: `linear-gradient(135deg, ${c.forest} 0 40%, ${c.farmland} 40% 70%, ${c.tundra} 70%)` };
    }
    case "buildings": {
      const f = m.building.fill;
      return {
        inset: 6,
        background: `linear-gradient(${f.residential}, ${f.residential}) 0 0 / 7px 7px no-repeat, linear-gradient(${f.commercial}, ${f.commercial}) 100% 0 / 7px 9px no-repeat, linear-gradient(${f.civic}, ${f.civic}) 0 100% / 9px 6px no-repeat, linear-gradient(${f.industrial}, ${f.industrial}) 100% 100% / 6px 6px no-repeat`,
      };
    }
    case "skyways":
      return bar(`repeating-linear-gradient(90deg, ${m.skyway} 0 6px, transparent 6px 9px)`, 3);
    case "boundaries":
    case "districtLines":
      return {
        inset: 5,
        border: `1.5px solid ${m.cityLine.color}`,
        borderRadius: 4,
        background: layers.districtLines ? `linear-gradient(90deg, transparent calc(50% - 0.5px), ${m.districtLine.color} calc(50% - 0.5px) calc(50% + 0.5px), transparent calc(50% + 0.5px))` : undefined,
      };
    case "choropleth":
      return { inset: 0, background: `linear-gradient(135deg, ${m.choropleth.join(", ")})` };
  }
}

export function LayersTab() {
  const lang = useAtlas((s) => s.lang);
  const layers = useAtlas((s) => s.layers);
  const toggleLayer = useAtlas((s) => s.toggleLayer);
  const map = THEMES[useAtlas((s) => s.theme)].map;

  const thumb = (k: keyof LayerToggles, size: string) => (
    <span className={clsx("relative block shrink-0 overflow-hidden rounded-lg ring-1 ring-line transition-opacity", size)} style={{ background: map.land, opacity: layers[k] ? 1 : 0.55 }}>
      <span className="absolute inset-x-0" style={swatch(k, map, layers)} />
    </span>
  );
  const tick = (on: boolean) => (
    <span
      className={clsx(
        "absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-accent text-on-accent shadow-sm ring-2 ring-panel-solid transition-transform duration-200",
        on ? "scale-100" : "scale-0",
      )}
    >
      <Check className="size-2" strokeWidth={4} />
    </span>
  );
  /** Boundaries tile: the tile toggles the layer; its two-way switch picks city or district detail (and turns the layer on). */
  const boundariesTile = () => {
    const on = layers.boundaries;
    const pick = (district: boolean) => {
      if (layers.districtLines !== district) toggleLayer("districtLines");
      if (!on) toggleLayer("boundaries");
    };
    return (
      <div
        key="boundaries"
        className={clsx("relative flex min-w-0 items-center gap-2 rounded-xl p-1.5 ring-1 transition-colors", on ? "bg-accent-soft ring-accent/35" : "ring-line hover:bg-hover")}
      >
        <button onClick={() => toggleLayer("boundaries")} aria-pressed={on} aria-label={t("boundaries", lang)} className="absolute inset-0 rounded-xl" />
        <span className="pointer-events-none relative shrink-0">
          {thumb("boundaries", "size-8")}
          {tick(on)}
        </span>
        <span className="pointer-events-none relative min-w-0 flex-1">
          <span className={clsx("block truncate text-[12px] leading-tight", on ? "font-medium text-ink" : "text-muted")}>{t("boundaries", lang)}</span>
          <span role="radiogroup" aria-label={t("boundaryLevel", lang)} className={clsx("pointer-events-auto mt-1 inline-flex rounded-md bg-hover p-0.5 transition-opacity", !on && "opacity-60")}>
            {[false, true].map((district) => {
              const checked = layers.districtLines === district;
              return (
                <button
                  key={String(district)}
                  role="radio"
                  aria-checked={checked}
                  onClick={() => pick(district)}
                  className={clsx(
                    "rounded-[5px] px-1.5 py-px text-[10.5px] leading-4 transition-colors",
                    checked ? "bg-panel-solid font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {t(district ? "levelDistrict" : "levelCity", lang)}
                </button>
              );
            })}
          </span>
        </span>
      </div>
    );
  };

  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.title} className="not-first:mt-1.5">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">{t(group.title, lang)}</p>
          {group.cards ? (
            <div className="grid grid-cols-2 gap-1.5 px-1 pb-1">
              {group.keys.map((k) =>
                k === "boundaries" ? (
                  boundariesTile()
                ) : (
                  <button
                    key={k}
                    onClick={() => toggleLayer(k)}
                    aria-pressed={layers[k]}
                    className={clsx(
                      "flex min-w-0 items-center gap-2 rounded-xl p-1.5 text-left ring-1 transition-colors",
                      layers[k] ? "bg-accent-soft ring-accent/35" : "ring-line hover:bg-hover",
                    )}
                  >
                    <span className="relative shrink-0">
                      {thumb(k, "size-8")}
                      {tick(layers[k])}
                    </span>
                    <span className={clsx("line-clamp-2 min-w-0 flex-1 text-[12px] leading-tight", layers[k] ? "font-medium text-ink" : "text-muted")}>{t(k as StringKey, lang)}</span>
                  </button>
                ),
              )}
            </div>
          ) : (
            group.keys.map((k) => (
              <button key={k} onClick={() => toggleLayer(k)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-[13px] text-ink hover:bg-hover" aria-pressed={layers[k]}>
                {thumb(k, "size-7")}
                <span className="flex-1 text-left">{t(k as StringKey, lang)}</span>
                <Switch on={layers[k]} />
              </button>
            ))
          )}
        </div>
      ))}
    </>
  );
}
