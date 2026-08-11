import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { organization, meeting } from "@/db/schema";
import { calendarToken } from "@/lib/calendar";

/**
 * iCal feed of scheduled meetings, for Google/Apple Calendar subscription.
 * Token = HMAC-SHA256("calendar", org.ingestSecret) — capability URL, no
 * login (calendar apps can't authenticate), no schema change.
 */

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const [org] = await db.select().from(organization).limit(1);
  if (!org?.ingestSecret || token !== calendarToken(org.ingestSecret)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const horizon = new Date(Date.now() - 90 * 86400000);
  const meetings = await db
    .select()
    .from(meeting)
    .where(and(eq(meeting.orgId, org.id), gte(meeting.scheduledAt, horizon)));

  const events = meetings
    .filter((m) => m.status !== "cancelled")
    .map((m) => {
      const end = new Date(m.scheduledAt.getTime() + m.durationMinutes * 60000);
      return [
        "BEGIN:VEVENT",
        `UID:${m.id}@openventure`,
        `DTSTAMP:${icsDate(new Date())}`,
        `DTSTART:${icsDate(m.scheduledAt)}`,
        `DTEND:${icsDate(end)}`,
        `SUMMARY:${escape(`${org.name}: ${m.title}`)}`,
        ...(m.location ? [`LOCATION:${escape(m.location)}`] : []),
        "END:VEVENT",
      ].join("\r\n");
    });

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenVenture//EN",
    `X-WR-CALNAME:${escape(org.name)}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}
