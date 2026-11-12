import { ImageResponse } from "next/og";
import { BRAND, BrandMark } from "@/components/marketing/brand-image";

export const alt =
  "A memo. To: whoever runs the club next year. From: the officers about to graduate. Re: everything we know leaves in May. OpenVenture, open-source software for student-run grant funds.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const label = { fontSize: 20, letterSpacing: "0.16em", color: BRAND.fgSubtle } as const;

/**
 * The card a shared link unfurls into (Slack, iMessage, X, LinkedIn). It is
 * the head of the landing page's memo: same rule, same To / From / Re, same
 * sentence. Built at build time; Twitter falls back to this image, so there
 * is no separate file.
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
          padding: "56px 72px 52px",
          background: BRAND.bg,
          color: BRAND.fg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <BrandMark size={48} />
          <div style={{ fontSize: 30, letterSpacing: "-0.02em" }}>OpenVenture</div>
          <div style={{ ...label, marginLeft: "auto" }}>MEMORANDUM · MEM-001</div>
        </div>
        <div style={{ height: 3, background: BRAND.fg, marginTop: 26 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 30, fontSize: 26 }}>
          <div style={{ display: "flex" }}>
            <div style={{ ...label, width: 130, paddingTop: 6 }}>TO</div>
            <div>Whoever runs the club next year</div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ ...label, width: 130, paddingTop: 6 }}>FROM</div>
            <div>The officers who are about to graduate</div>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 34 }}>
          <div style={{ ...label, width: 130, paddingTop: 30 }}>RE</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 104,
              lineHeight: 1,
              letterSpacing: "-0.045em",
            }}
          >
            <div>Everything we know</div>
            <div>leaves in May.</div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            paddingTop: 22,
            borderTop: `1.5px solid ${BRAND.borderStrong}`,
            fontSize: 24,
            color: BRAND.fgMuted,
          }}
        >
          Open-source software for student-run grant funds
          <div style={{ marginLeft: "auto" }}>MIT · self-hosted</div>
        </div>
      </div>
    ),
    size
  );
}
