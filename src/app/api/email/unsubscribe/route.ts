import { NextResponse } from "next/server";
import { verifyUnsubscribe } from "@/lib/email";
import { setEmailPref } from "@/lib/email-prefs";

/**
 * One-click unsubscribe (RFC 8058). Mail clients that show their own
 * "Unsubscribe" button POST here, with no session and no page. A GET — a
 * person or a link scanner following the URL — changes nothing and goes to
 * the confirmation page instead.
 */

function read(req: Request) {
  const url = new URL(req.url);
  return {
    memberId: url.searchParams.get("m") ?? "",
    category: url.searchParams.get("c") ?? "",
    signature: url.searchParams.get("s") ?? "",
    search: url.search,
  };
}

export async function POST(req: Request) {
  const { memberId, category, signature } = read(req);
  if (!verifyUnsubscribe(memberId, category, signature)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  await setEmailPref(memberId, category, false);
  return new NextResponse(null, { status: 204 });
}

export function GET(req: Request) {
  const { search } = read(req);
  return NextResponse.redirect(new URL(`/unsubscribe${search}`, req.url), 303);
}
