import clsx from "clsx";
import type { ReactNode } from "react";

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
