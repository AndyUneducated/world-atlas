import clsx from "clsx";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="mb-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</h3>
      {children}
    </section>
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

export function Sub({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-0">
      <h4 className="mb-1.5 text-[11px] font-semibold text-faint">{label}</h4>
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
