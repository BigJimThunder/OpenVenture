"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

/**
 * A card with a soft light that follows the pointer. The light is a CSS
 * gradient; this only reports where the pointer is, as two custom properties.
 */
export function Spotlight({
  className,
  children,
  ...rest
}: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={cn(styles.card, styles.spot, className)}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType === "touch") return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
