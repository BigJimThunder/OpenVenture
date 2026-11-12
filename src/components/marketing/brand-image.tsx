/**
 * The product mark and palette for generated images — the favicon, the
 * home-screen icons and the link-preview card (src/app/icon.tsx and friends).
 *
 * This is the one place colors appear as hex: those images are rasterized
 * outside the browser, where the CSS variables in globals.css don't exist.
 * Each value mirrors the light-theme token named beside it; change them
 * together.
 */
export const BRAND = {
  accent: "#2a5cda", // --accent
  accentFg: "#fafcff", // --accent-fg
  bg: "#fdfdfe", // --bg
  panel: "#ffffff", // --panel
  chrome: "#f3f4f6", // --chrome
  border: "#e4e5e8", // --border
  borderStrong: "#cfd1d5", // --border-strong
  fg: "#14171d", // --fg
  fgMuted: "#4c5057", // --fg-muted
  fgSubtle: "#676a71", // --fg-subtle
  success: "#007b43", // --success
  /** --cat-1…5: the five pipeline stages, in order. */
  stages: ["#3567de", "#009c9c", "#cb9317", "#8557c8", "#1c985a"],
} as const;

/**
 * The "OV" mark from the header, drawn as shapes instead of set in type so
 * it renders identically at 16px and 512px without shipping a font.
 * `bleed` fills the whole square (iOS and maskable icons, which get their
 * corners from the platform); otherwise the tile carries its own radius.
 */
export function BrandMark({ size, bleed = false }: { size: number; bleed?: boolean }) {
  // Full-bleed icons keep the letters inside the platform's safe zone.
  const glyph = Math.round(size * (bleed ? 0.6 : 0.8));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.accent,
        borderRadius: bleed ? 0 : Math.round(size * 0.27),
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 48 48" fill="none">
        <ellipse cx="12.9" cy="24" rx="8.5" ry="8.8" stroke={BRAND.accentFg} strokeWidth="4.8" />
        <path d="M26 13.5 H31.4 L36 28 L40.6 13.5 H46 L38.9 34.5 H33.1 Z" fill={BRAND.accentFg} />
      </svg>
    </div>
  );
}
