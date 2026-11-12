import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/marketing/brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon. Full-bleed and opaque: iOS rounds the corners itself. */
export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={size.width} bleed />, size);
}
