import { ImageResponse } from "next/og";
import { BRAND, BrandMark } from "@/components/marketing/brand-image";

export const alt =
  "OpenVenture — run your grant club like a fund. Applications, screening, memos, blind votes and grants in one place.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STAGES = ["Application", "Screening", "Coffee chat", "Memo and vote", "Grant and outcome"];

/**
 * The card a shared link unfurls into (Slack, iMessage, X, LinkedIn). Says
 * what the landing page's hero says, over the five pipeline stages. Built at
 * build time; Twitter falls back to this image, so there is no separate file.
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
          justifyContent: "space-between",
          padding: "64px 72px 60px",
          background: BRAND.bg,
          color: BRAND.fg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <BrandMark size={56} />
          <div style={{ fontSize: 34, letterSpacing: "-0.02em" }}>OpenVenture</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginLeft: "auto",
              padding: "8px 18px",
              border: `1.5px solid ${BRAND.border}`,
              borderRadius: 999,
              background: BRAND.panel,
              fontSize: 22,
              color: BRAND.fgMuted,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 999, background: BRAND.success }} />
            Open source · MIT licensed · Self-hosted
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 100,
              lineHeight: 1.04,
              letterSpacing: "-0.045em",
            }}
          >
            <div>Run your grant club</div>
            <div style={{ color: BRAND.accent }}>like a fund.</div>
          </div>
          <div style={{ marginTop: 28, fontSize: 30, lineHeight: 1.4, color: BRAND.fgMuted }}>
            Applications, screening, memos, blind votes and grants in one place.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            border: `1.5px solid ${BRAND.border}`,
            borderRadius: 16,
            background: BRAND.panel,
            overflow: "hidden",
          }}
        >
          {STAGES.map((name, i) => (
            <div
              key={name}
              style={{
                display: "flex",
                flexGrow: 1,
                alignItems: "center",
                gap: 12,
                padding: "20px 22px",
                borderLeft: i === 0 ? "none" : `1.5px solid ${BRAND.border}`,
                fontSize: 22,
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: 999, background: BRAND.stages[i] }} />
              {name}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
