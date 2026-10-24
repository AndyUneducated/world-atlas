// Downloads MapLibre SDF glyph ranges for the Latin-script fonts used by map labels.
// CJK labels are rasterised locally by MapLibre (localIdeographFontFamily), so only
// the ranges needed for Latin, punctuation and symbols are fetched.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fonts");
const source = "https://protomaps.github.io/basemaps-assets/fonts";
const fonts = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
const starts = [0, 256, 512, 768, 1024, 7680, 7936, 8192, 8448, 8704, 9472, 9728, 11776, 12288, 65024, 65280];

for (const font of fonts) {
  for (const start of starts) {
    const range = `${start}-${start + 255}`;
    const res = await fetch(`${source}/${encodeURIComponent(font)}/${range}.pbf`);
    if (!res.ok) throw new Error(`${font} ${range}: HTTP ${res.status}`);
    const file = join(root, font, `${range}.pbf`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  console.log(`fetched ${font}`);
}
