import { describe, expect, it } from "vitest";
import { htmlToText, sendEmail, unsubscribeUrl, verifyUnsubscribe } from "./email";

describe("htmlToText", () => {
  it("keeps the words and the links, drops the markup", () => {
    const text = htmlToText(
      `<html><head><style>p{color:red}</style></head><body><h1>Vote closing</h1><p>Two rounds close <b>tomorrow</b>.<br>Don&#39;t miss them &amp; vote.</p><p><a href="https://club.test/memos/1?a=1&amp;b=2">Cast your ballot</a></p></body></html>`
    );
    expect(text).toBe(
      "Vote closing\n\nTwo rounds close tomorrow.\nDon't miss them & vote.\n\nCast your ballot: https://club.test/memos/1?a=1&b=2"
    );
  });

  it("does not repeat a link whose label is the address", () => {
    expect(htmlToText(`<a href="https://club.test/x">https://club.test/x</a>`)).toBe("https://club.test/x");
  });
});

describe("unsubscribe links", () => {
  const memberId = "0d8c4f0e-6a3f-4d0b-9a56-0c4de1a2b3c4";

  it("round-trip: the link's own parameters verify", () => {
    const url = new URL(unsubscribeUrl(memberId, "digest"));
    expect(url.pathname).toBe("/unsubscribe");
    expect(verifyUnsubscribe(url.searchParams.get("m")!, url.searchParams.get("c")!, url.searchParams.get("s")!)).toBe(true);
    expect(new URL(unsubscribeUrl(memberId, "digest", "oneClick")).pathname).toBe("/api/email/unsubscribe");
  });

  it("a signature is bound to its member and its category", () => {
    const s = new URL(unsubscribeUrl(memberId, "digest")).searchParams.get("s")!;
    expect(verifyUnsubscribe(memberId, "reminders", s)).toBe(false);
    expect(verifyUnsubscribe("11111111-1111-4111-8111-111111111111", "digest", s)).toBe(false);
    expect(verifyUnsubscribe(memberId, "everything", s)).toBe(false);
    expect(verifyUnsubscribe(memberId, "digest", "")).toBe(false);
  });
});

describe("sendEmail audience", () => {
  const mail = { to: "m@club.test", subject: "Digest", html: "<html><body><p>Hi</p></body></html>" };
  const memberId = "0d8c4f0e-6a3f-4d0b-9a56-0c4de1a2b3c4";

  it("skips a kind of email the member switched off, and an address that is bouncing", async () => {
    expect(await sendEmail({ ...mail, audience: { memberId, category: "digest", prefs: { digest: false } } })).toBe("skipped");
    expect(
      await sendEmail({ ...mail, audience: { memberId, category: "reminders", prefs: { undeliverableSince: "2026-01-01" } } })
    ).toBe("skipped");
  });

  it("sends the other kinds, and mail with no audience always goes", async () => {
    // No RESEND_API_KEY in tests: a send is "logged".
    expect(await sendEmail({ ...mail, audience: { memberId, category: "reminders", prefs: { digest: false } } })).toBe("logged");
    expect(await sendEmail(mail)).toBe("logged");
  });
});
