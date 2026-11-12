import { ImageResponse } from "next/og";
import { BRAND, BrandMark } from "@/components/marketing/brand-image";

export const alt =
  "OpenVenture: the operating system for student venture funds. Pipeline, memos, blind votes and grants in one open-source workspace.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STAGES = ["Applied", "Screening", "Coffee Chat", "Pitched Group", "Decision"];

/**
 * The card a shared link unfurls into (Slack, iMessage, X, LinkedIn). It
 * carries the landing page's headline over the five pipeline stages, in the
 * stage colors. Built at build time; Twitter falls back to this image, so
 * there is no separate file.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 72px 56px",
          background: BRAND.bg,
          color: BRAND.fg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BrandMark size={52} />
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em" }}>OpenVenture</div>
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              padding: "8px 18px",
              borderRadius: 999,
              border: `1.5px solid ${BRAND.borderStrong}`,
              fontSize: 22,
              color: BRAND.fgMuted,
            }}
          >
            Open source · MIT
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 64,
            fontSize: 92,
            fontWeight: 600,
            lineHeight: 1.02,
            letterSpacing: "-0.045em",
          }}
        >
          <div>The operating system</div>
          <div style={{ color: BRAND.fgSubtle }}>for student venture funds.</div>
        </div>

        <div style={{ display: "flex", marginTop: 30, fontSize: 29, color: BRAND.fgMuted }}>
          Pipeline, memos, blind votes and grants in one workspace.
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
          {STAGES.map((stage, i) => (
            <div
              key={stage}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: 1,
                padding: "14px 16px",
                borderRadius: 12,
                border: `1.5px solid ${BRAND.border}`,
                background: BRAND.panel,
                fontSize: 21,
                color: BRAND.fgMuted,
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: 999, background: BRAND.stages[i] }} />
              {stage}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
