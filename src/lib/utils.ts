import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export function formatMoney(value: number | string, opts?: { cents?: boolean }) {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return (opts?.cents ? usdCents : usd).format(n);
}

export function formatPct(fraction: number, digits = 1) {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatCompact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Academic-year season (Jul–Jun) — the club's unit of time, not the calendar
 * year. A date in Oct 2025 and one in Mar 2026 are both season 2025.
 */
export function seasonStartYear(date: Date) {
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
}

/** e.g. 2025 → "2025–26" */
export function seasonLabel(startYear: number) {
  return `${startYear}–${String(startYear + 1).slice(2)}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
