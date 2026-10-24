import clsx from "clsx";
import { displayName } from "../lib/i18n";
import { useAtlas } from "../store";
import { Emblem } from "./Emblem";

/** Map marker for a landmark that carries an emblem (e.g. the territory government building). */
export function PlaceMarker({ id }: { id: string }) {
  const data = useAtlas((s) => s.data);
  const lang = useAtlas((s) => s.lang);
  const selected = useAtlas((s) => s.selectedId === id);
  const select = useAtlas((s) => s.select);
  const place = data?.entities[id];
  const owner = place?.emblem_of ? data?.entities[place.emblem_of] : undefined;
  if (!place || !owner) return null;
  return (
    <button
      onClick={() => select(id)}
      className={clsx("atlas-marker group relative grid place-items-center", selected && "is-selected")}
      aria-label={displayName(place, lang)}
    >
      <span className="atlas-marker-halo absolute inset-0 rounded-full" />
      <span className="relative transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-110">
        <Emblem entity={owner} size={36} className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]" />
      </span>
      <span className="glass pointer-events-none absolute top-full mt-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-ink opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {displayName(place, lang)}
      </span>
    </button>
  );
}
