import clsx from "clsx";
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Entity, Lang } from "../lib/types";
import { registerCardScroller, useAtlas } from "../store";

/** An opened-or-not part of a card, kept with the card so going back shows it as it was left. */
export function useCardOpen(key: string): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => useAtlas.getState().cardView.open[key] ?? false);
  return [
    open,
    (next) => {
      setOpen(next);
      useAtlas.getState().setCardOpen(key, next);
    },
  ];
}

/** The card's scrolling element: scrolled back to where it was left when shown again on going back. */
export function useCardScroll<T extends HTMLElement>(id: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerCardScroller(id, el);
    const { scroll } = useAtlas.getState().cardView;
    el.scrollTop = scroll;
    // charts may settle their height a frame later
    const frame = scroll ? requestAnimationFrame(() => (el.scrollTop = scroll)) : 0;
    return () => {
      cancelAnimationFrame(frame);
      registerCardScroller(id, null);
    };
  }, [id]);
  return ref;
}

/** The title of the card group a part sits in (null on a one-column card). A grouped card has two levels of
 * heading: the group, then each section or branch within it, ruled off from the next across the card. */
export const GroupTitle = createContext<string | null>(null);

/** A section of a card. In a group, its title is a second-level heading, left out when it would only repeat
 * the group's title or when the section is `flat`: made of branches that are second-level headings of their
 * own. */
export function Section({ title, flat, children }: { title?: string; flat?: boolean; children: ReactNode }) {
  const group = useContext(GroupTitle);
  const heading = title && !(group !== null && (flat || title === group)) ? title : null;
  return (
    <section className="border-t border-line px-5 py-4">
      {heading &&
        (group !== null ? (
          <h3 className="mb-2.5 text-[13px] font-medium text-muted">{heading}</h3>
        ) : (
          <h3 className="mb-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{heading}</h3>
        ))}
      {children}
    </section>
  );
}

/** A section whose figures do not apply to the entity (its na: fields), with the reason in their place. */
export function NotApplicable({ entity, field, title, lang }: { entity: Entity; field: string; title: string; lang: Lang }) {
  if (!entity.na?.fields.includes(field)) return null;
  return (
    <Section title={title}>
      <p className="text-[13px] leading-relaxed text-muted">{entity.na.note[lang]}</p>
    </Section>
  );
}

export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-ink tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A labelled figure inside a section: a field, not a heading level of its own. */
export function Sub({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-0">
      <h4 className="mb-1.5 text-[12px] text-muted">{label}</h4>
      {children}
    </div>
  );
}

/** Text written with line breaks between its paragraphs. */
export function Paragraphs({ text, className }: { text: string; className: string }) {
  return (
    <div className={clsx("space-y-2", className)}>
      {text
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </div>
  );
}
