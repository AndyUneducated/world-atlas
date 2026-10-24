import clsx from "clsx";
import { motion } from "motion/react";

export function Switch({ on }: { on: boolean }) {
  return (
    <span className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-accent" : "bg-hover ring-1 ring-line")}>
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 34 }} className={clsx("absolute top-0.5 size-4 rounded-full bg-white shadow", on ? "right-0.5" : "left-0.5")} />
    </span>
  );
}
