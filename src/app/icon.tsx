import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/marketing/brand-image";

/**
 * The OV mark as the browser-tab icon and the installed-app icons. One file
 * renders every size, so the tab, the home screen and the header can never
 * drift apart. `maskable` is full-bleed for launchers that cut their own
 * shape. `manifest.ts` points at `/icon/192`, `/icon/512` and
 * `/icon/maskable`.
 */
const ICONS = {
  "32": { px: 32, bleed: false },
  "192": { px: 192, bleed: false },
  "512": { px: 512, bleed: false },
  maskable: { px: 512, bleed: true },
} as const;

export function generateImageMetadata() {
  return Object.entries(ICONS).map(([id, { px }]) => ({
    id,
    contentType: "image/png",
    size: { width: px, height: px },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const { px, bleed } = ICONS[String(await id) as keyof typeof ICONS] ?? ICONS["32"];
  return new ImageResponse(<BrandMark size={px} bleed={bleed} />, { width: px, height: px });
}
