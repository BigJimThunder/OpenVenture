import { formatDistanceToNow } from "date-fns";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/schema";

export type DeviceSession = {
  id: string;
  device: string;
  /** "3 hours ago" — worded on the server so it cannot differ on hydration. */
  lastSeen: string;
  current: boolean;
};

/** "Chrome on macOS" from a user-agent string; deliberately coarse. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} on ${os}` : browser;
}

/** The live sessions of one auth user, newest activity first. */
export async function getDeviceSessions(userId: string, currentSessionId: string | null): Promise<DeviceSession[]> {
  const rows = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt))
    .limit(25);
  return rows.map((r) => ({
    id: r.id,
    device: describeDevice(r.userAgent),
    lastSeen: `${formatDistanceToNow(r.updatedAt)} ago`,
    current: r.id === currentSessionId,
  }));
}
