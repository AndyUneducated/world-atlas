import clsx from "clsx";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
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

/** A scrolling box whose scrollbar floats over the content instead of taking a strip of the box's width:
 * a thin thumb at the right edge, shown while the box scrolls or the pointer is over it, and draggable. */
export function ScrollArea({
  scrollRef,
  className,
  innerClassName,
  children,
  ...inner
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const thumb = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const drag = useRef<{ y0: number; top0: number } | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const th = thumb.current;
    if (!el || !th) return;
    let idle = 0;
    const place = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const over = scrollHeight - clientHeight;
      th.hidden = over <= 1;
      if (th.hidden) return;
      const h = Math.max((clientHeight * clientHeight) / scrollHeight, 28);
      th.style.height = `${h}px`;
      th.style.transform = `translateY(${(scrollTop / over) * (clientHeight - h)}px)`;
    };
    const scrolled = () => {
      place();
      setActive(true);
      clearTimeout(idle);
      idle = window.setTimeout(() => setActive(false), 900);
    };
    place();
    el.addEventListener("scroll", scrolled, { passive: true });
    const resize = new ResizeObserver(place);
    resize.observe(el);
    if (el.firstElementChild) resize.observe(el.firstElementChild);
    return () => {
      clearTimeout(idle);
      el.removeEventListener("scroll", scrolled);
      resize.disconnect();
    };
  }, [scrollRef]);

  const grab = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, top0: el.scrollTop };
  };
  const pull = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const th = thumb.current;
    if (!drag.current || !el || !th) return;
    const { scrollHeight, clientHeight } = el;
    const travel = clientHeight - th.offsetHeight;
    if (travel > 0) el.scrollTop = drag.current.top0 + ((e.clientY - drag.current.y0) / travel) * (scrollHeight - clientHeight);
  };
  const release = () => (drag.current = null);

  return (
    <div className={clsx("group/scroll relative flex min-h-0 flex-col", className)}>
      <div ref={scrollRef} {...inner} className={clsx("scrollbar-none min-h-0", innerClassName)}>
        {children}
      </div>
      <div
        ref={thumb}
        onPointerDown={grab}
        onPointerMove={pull}
        onPointerUp={release}
        onPointerCancel={release}
        aria-hidden
        className={clsx(
          "absolute top-0 right-0.5 w-1.5 cursor-default touch-none rounded-full bg-faint/60 transition-opacity duration-300 hover:bg-faint",
          active ? "opacity-100" : "opacity-0 group-hover/scroll:opacity-100",
        )}
      />
    </div>
  );
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
      {rows.map(([k, v], i) => (
        // labels can repeat (two deputy speakers), so the key carries the position too
        <div key={`${i}:${k}`} className="contents">
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
