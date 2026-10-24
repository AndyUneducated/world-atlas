# World Atlas · 世界地图

An interactive atlas of **Homeworld**, a fictional planet. The first mapped region is the
Territory of North Viking Island (北维京岛领地), China.

Live site: https://andyuneducated.github.io/world-atlas/

## How it works

Everything on the map is generated from the YAML files in `world/`. Nothing in
`public/data/` is edited by hand.

```
world/*.yaml  ──►  pipeline/build.py  ──►  public/data/*.geojson, dem/  ──►  React + MapLibre app
 (canon)            (deterministic)          (build artifacts)
```

| Path | Contents |
|:--|:--|
| `world/planet.yaml` | Planet and coordinate reference system |
| `world/registry/` | Countries (ISO 3166-1) |
| `world/divisions/` | Administrative divisions: territory, cities, districts |
| `world/features/` | Natural features: mountain ranges, rivers, lakes, coastal landforms (bays, fjords, capes, straits, islands, river mouths), peaks, passes and glaciers |
| `world/transport/` | Numbered routes (expressways, highways) and intercity railways |
| `world/places/` | Landmarks, buildings and transport facilities (airports, ports, spaceports) |
| `world/generator/` | Layout parameters: coastline, terrain, city anchors, seeds |
| `pipeline/` | Python generator |
| `src/` | Web app |

The pipeline is seeded and deterministic: the same YAML always produces the same map.
Changing a city's area, moving its anchor, or adding a route only means editing YAML and
re-running the build.

Rivers, coastal landforms, peaks, passes and glaciers are found by the generator. An entry in `world/features/`
names one with `detect: {kind, at_km}`, which claims the nearest landform of that kind.
After each build, `.cache/candidates-<territory>.json` lists every landform found,
named or not, with its district and size, so new ones can be named by adding entries.

Entities can also be added or edited in bulk from a spreadsheet:
`npm run data:import -- file.csv` checks every row and writes into `world/` only if the
whole file passes. Templates and a guide (in Chinese) are in [`templates/csv/`](templates/csv/README.md).

## Conventions

- **IDs.** Each entity has a permanent ID (`div_…`, `nat_…`, `rte_…`, `poi_…`, `bld_…`)
  that never changes. Business codes (division codes, ISO codes, route numbers) are
  separate fields and may change.
- **Status.** `canon` comes from the world setting. `generated` was filled in by the
  generator or an assistant and is pending review.
- **Names.** BCP 47 keys: `zh`, `en`, `art-x-viking`, `art-x-buckham`.
- **Hierarchy.** Country → territory (`dependency`) → city (`locality`) → district
  (`borough`), following the Overture Maps division subtypes. Division codes follow the
  six-digit GB/T 2260 pattern (`900000` → `900100` → `900101`).
- **Routes.** `G-NV-n` national, `S-NV-n` territorial, `X-NV-n` municipal and
  `Y-NV-n` township roads (GB/T 917 numbering, with the territory infix `NV`). A route's
  `via` lists cities or districts; `ring`, `straight` (straight legs, crossing hills and
  water on structures) and per-leg `legs` overrides shape the path. Territorial routes name
  a `shield` glyph for their BC-style sign.
- **Engineering.** `world/transport/engineering.yaml` holds the standard of each road and
  rail network: grade limits, bridge and tunnel thresholds, unit costs in US dollars, speed
  limits and technical data. The generator derives each route's bridge and tunnel lengths,
  construction cost, yearly upkeep and per-segment speed limits from it.
- **Streets.** City streets are generated from the `streets` section of a generator file:
  each district's built-up area gets arterials (主干道), collectors (次干道) and local
  streets (支路) in a planned, mixed or organic style. Fixed names such as 人民大道 are
  pinned to grid lines under `named`; all other names are composed from the stems and
  suffixes in `world/names/streets.yaml`. Arterials and collectors are clickable routes;
  local streets are drawn and labelled only.
- **Buildings.** The blocks between a city's streets are filled with generated building
  footprints whose type (slab estates, towers, courtyard blocks, shops, houses, sheds, parks)
  follows the district style, optionally weighted per district (`mix`). Places with a `site` (size and layout template) are drawn as
  clickable landmarks; streets and generated buildings keep out of their grounds.
  The `airport`, `port` and `spaceport` layouts draw runways, piers and launch pads, and an
  optional `angle_deg` turns a site to an absolute bearing (east = 0°, counter-clockwise).
- **Railways.** Intercity lines in `world/transport/*-rail.yaml` list their stops (cities
  or districts) and are laid over the terrain with gentler gradients than roads; `tech`
  sets their operating and design speeds. City metro
  lines come from the `metro` section of a generator file and stay inside a district's
  built-up area. Stations are places of subtype `station`; lines and stations get IDs
  derived from stable keys, so they survive rebuilds.

## Development

Requirements: Node 22+ and Python 3.12+.

```sh
pip install -r pipeline/requirements.txt
npm install
npm run data        # generate public/data (about 2 minutes)
npm run dev         # http://localhost:5173
```

`npm run data:check` validates the YAML without generating anything. Pushing to `main`
runs the pipeline and deploys to GitHub Pages through `.github/workflows/deploy.yml`.

Display-only layers with many features (land cover, streams, sea depth, streets, buildings) are packed into a
[PMTiles](https://docs.protomaps.com/pmtiles/) vector tile archive by `pipeline/tiles.py`
with [tippecanoe](https://github.com/felt/tippecanoe), and the site reads them tile by tile.
CI always builds the archive; locally it is optional, and without tippecanoe the site loads
the same layers as GeoJSON.

Design decisions made without an explicit instruction are recorded in
[`DECISIONS.md`](DECISIONS.md).

## License

Code: MIT. World content (`world/` and the generated map data): CC BY-NC-SA 4.0.
See [`LICENSE`](LICENSE).
