import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { lineage } from "../lib/entity";
import { displayName } from "../lib/i18n";
import { useAtlas } from "../store";
import { Emblem, hasEmblem } from "./Emblem";

export function Breadcrumbs() {
  const data = useAtlas((s) => s.data);
  const lang = useAtlas((s) => s.lang);
  const selectedId = useAtlas((s) => s.selectedId);
  const select = useAtlas((s) => s.select);
  const entity = selectedId && data ? data.entities[selectedId] : undefined;
  if (!data || !entity) return null;
  const chain = lineage(data, entity);

  return (
    <nav aria-label="breadcrumb" className="pointer-events-auto flex flex-wrap items-center gap-1 px-1">
      {chain.map((e, i) => {
        const last = i === chain.length - 1;
        const clickable = !last && !!e.bbox;
        return (
          <span key={e.id} className="flex items-center gap-1">
            <button
              disabled={!clickable}
              onClick={() => select(e.id)}
              className={clsx(
                "glass flex items-center gap-1.5 rounded-full py-1 text-[12px] leading-none transition-colors",
                hasEmblem(e) ? "pr-2.5 pl-1" : "px-2.5",
                last ? "font-medium text-ink" : "text-muted",
                clickable && "hover:text-ink",
              )}
            >
              {hasEmblem(e) && <Emblem entity={e} size={15} />}
              {e.short_names?.[lang] ?? displayName(e, lang)}
            </button>
            {!last && <ChevronRight className="size-3.5 text-faint" />}
          </span>
        );
      })}
    </nav>
  );
}
