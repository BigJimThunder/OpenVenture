import { describe, expect, it } from "vitest";
import { nameFromEmail, parseInviteLines } from "./invites";
import { adminNotice, memberNudge, type NudgeSubject } from "./nudges";
import {
  buildSteps,
  entry,
  isOverdue,
  profileConfirmed,
  resolveStep,
  stageOf,
  summarize,
  type JourneyItem,
  type JourneyMember,
} from "./progress";
import { detectKind, safeHttpUrl, videoEmbed } from "./resource";

const DAY = 86_400_000;
const NOW = new Date("2026-11-11T15:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function item(id: string, over: Partial<JourneyItem> = {}): JourneyItem {
  return {
    id,
    assignmentId: "a1",
    title: id,
    description: null,
    kind: "do",
    resourceUrl: null,
    docId: null,
    required: true,
    estimatedMinutes: 5,
    completedAt: null,
    verified: false,
    waived: false,
    ...over,
  };
}

const fresh: JourneyMember = { status: "active", role: "analyst", classYear: null, major: null, onboardedAt: null };
const confirmed: JourneyMember = { ...fresh, classYear: 2029, major: "Economics" };

describe("video links", () => {
  it("turns YouTube links of every common shape into a no-cookie embed", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com/live/dQw4w9WgXcQ",
    ]) {
      expect(videoEmbed(url)).toEqual({
        provider: "YouTube",
        embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
      });
    }
  });

  it("embeds Vimeo and Loom", () => {
    expect(videoEmbed("https://vimeo.com/channels/staffpicks/123456789")?.embedUrl).toBe(
      "https://player.vimeo.com/video/123456789?dnt=1"
    );
    expect(videoEmbed("https://www.loom.com/share/0123456789abcdef0123456789abcdef?sid=x")?.embedUrl).toBe(
      "https://www.loom.com/embed/0123456789abcdef0123456789abcdef"
    );
  });

  it("never builds a player from an id it cannot validate", () => {
    expect(videoEmbed('https://www.youtube.com/watch?v="><script>alert(1)</script>')).toBeNull();
    expect(videoEmbed("https://youtu.be/short")).toBeNull();
    expect(videoEmbed("https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbed("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbed("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbed("https://www.loom.com/share/not-a-loom-id")).toBeNull();
  });

  it("rejects anything that is not http(s)", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(detectKind("javascript:alert(1)")).toBeNull();
  });

  it("calls a playable link a video and everything else an article", () => {
    expect(detectKind("https://youtu.be/dQw4w9WgXcQ")).toEqual({ kind: "watch", provider: "YouTube" });
    expect(detectKind("https://paulgraham.com/ds.html")).toEqual({ kind: "read", provider: null });
  });
});

describe("bulk invite parsing", () => {
  it("reads the shapes people actually paste", () => {
    const out = parseInviteLines(
      ["Jordan Lee <jordan.lee@uni.edu>", "sam@uni.edu, Sam Goldstein", "Ada Lovelace ada@uni.edu", "", "maya.k27@uni.edu"].join("\n")
    );
    expect(out.map((o) => (o.ok ? [o.name, o.email] : o.error))).toEqual([
      ["Jordan Lee", "jordan.lee@uni.edu"],
      ["Sam Goldstein", "sam@uni.edu"],
      ["Ada Lovelace", "ada@uni.edu"],
      ["Maya K", "maya.k27@uni.edu"],
    ]);
    expect(out[3].line).toBe(5);
  });

  it("reports duplicates, existing members, wrong domains and junk per line", () => {
    const out = parseInviteLines("A <a@uni.edu>\nA again <A@uni.edu>\nb@uni.edu\nc@gmail.com\njust a name", {
      allowedDomains: ["uni.edu"],
      existingEmails: ["B@uni.edu"],
    });
    expect(out.map((o) => (o.ok ? "ok" : o.error))).toEqual([
      "ok",
      "Listed twice",
      "Already a member",
      "Must end in @uni.edu",
      "No email address on this line",
    ]);
  });

  it("guesses a name from an address", () => {
    expect(nameFromEmail("jordan_lee+club@uni.edu")).toBe("Jordan Lee");
  });
});

describe("progress", () => {
  it("counts required and optional separately and finds what the member is stuck on", () => {
    const s = summarize([
      item("a", { completedAt: NOW }),
      item("b", { estimatedMinutes: 12 }),
      item("c", { required: false }),
    ]);
    expect(s).toMatchObject({ requiredTotal: 2, requiredDone: 1, optionalTotal: 1, minutesTotal: 17, minutesLeft: 12 });
    expect(s.next?.id).toBe("b");
  });

  it("treats details as confirmed only with class year and major, or once through the flow", () => {
    expect(profileConfirmed({ classYear: 2029, major: null, onboardedAt: null })).toBe(false);
    expect(profileConfirmed({ classYear: 2029, major: "  ", onboardedAt: null })).toBe(false);
    expect(profileConfirmed({ classYear: 2029, major: "Math", onboardedAt: null })).toBe(true);
    expect(profileConfirmed({ classYear: null, major: null, onboardedAt: NOW })).toBe(true);
  });

  it("places a member in the pipeline", () => {
    expect(stageOf({ ...fresh, status: "invited" }, [item("a")])).toBe("invited");
    expect(stageOf(fresh, [item("a")])).toBe("setup");
    expect(stageOf(confirmed, [item("a")])).toBe("in_progress");
    expect(stageOf(confirmed, [item("a", { completedAt: NOW }), item("b", { required: false })])).toBe("complete");
    expect(stageOf(confirmed, [])).toBe("complete");
  });

  it("flags overdue only while unfinished", () => {
    expect(isOverdue("in_progress", ago(1), NOW)).toBe(true);
    expect(isOverdue("complete", ago(1), NOW)).toBe(false);
    expect(isOverdue("in_progress", null, NOW)).toBe(false);
  });

  it("blocks entry on required items, with an escape for admins only", () => {
    expect(entry(confirmed, [item("a")])).toEqual({ ready: false, canFinishLater: false });
    expect(entry({ ...fresh, role: "admin" }, [item("a")])).toEqual({ ready: false, canFinishLater: true });
    expect(entry(confirmed, [item("a", { completedAt: NOW })])).toEqual({ ready: true, canFinishLater: false });
    expect(entry(confirmed, [item("a", { required: false })]).ready).toBe(true);
    expect(entry(fresh, []).ready).toBe(false);
  });
});

describe("welcome flow steps", () => {
  const items = [item("a"), item("b"), item("c", { required: false })];

  it("lays out welcome, details, one screen per required item, extras, done", () => {
    expect(buildSteps(items).map((s) => s.key)).toEqual(["welcome", "profile", "a", "b", "extras", "done"]);
    expect(buildSteps([item("a")]).map((s) => s.key)).toEqual(["welcome", "profile", "a", "done"]);
  });

  it("starts a newcomer on the welcome screen and resumes at the first open item", () => {
    const steps = buildSteps(items);
    expect(resolveStep(steps, fresh)).toBe(0);
    expect(resolveStep(steps, confirmed)).toBe(2);
    const half = buildSteps([item("a", { completedAt: NOW }), item("b"), item("c", { required: false })]);
    expect(resolveStep(half, confirmed)).toBe(3);
  });

  it("lets the member go back but not skip ahead", () => {
    const steps = buildSteps(items);
    expect(resolveStep(steps, confirmed, "welcome")).toBe(0);
    expect(resolveStep(steps, confirmed, "b")).toBe(2);
    expect(resolveStep(steps, confirmed, "done")).toBe(2);
    expect(resolveStep(steps, fresh, "a")).toBe(1);
    expect(resolveStep(steps, confirmed, "nonsense")).toBe(2);
  });

  it("ends on extras first, then on done once the member is through", () => {
    const all = buildSteps([item("a", { completedAt: NOW }), item("c", { required: false })]);
    expect(all[resolveStep(all, confirmed)].kind).toBe("extras");
    expect(all[resolveStep(all, { ...confirmed, onboardedAt: NOW })].kind).toBe("done");
    expect(all[resolveStep(all, confirmed, "done")].kind).toBe("done");
  });
});

describe("nudges", () => {
  const base: NudgeSubject = {
    memberId: "m1",
    stage: "in_progress",
    invitedAt: ago(10),
    dueAt: null,
    completedAt: null,
    lastNudgeAt: null,
  };
  const today = "2026-11-11";

  it("reminds an unused invite once, after three days", () => {
    expect(memberNudge({ ...base, stage: "invited", invitedAt: ago(2) }, NOW, today)).toBeNull();
    expect(memberNudge({ ...base, stage: "invited", invitedAt: ago(3) }, NOW, today)).toEqual({
      kind: "invite_reminder",
      key: "invite:m1",
    });
  });

  it("nudges three days before the due date and once it has passed", () => {
    expect(memberNudge({ ...base, dueAt: ago(-5) }, NOW, today)).toBeNull();
    expect(memberNudge({ ...base, dueAt: ago(-3) }, NOW, today)?.kind).toBe("due_soon");
    expect(memberNudge({ ...base, dueAt: ago(1) }, NOW, today)).toEqual({ kind: "overdue", key: "due:m1:2026-11-11" });
    expect(memberNudge({ ...base, stage: "setup", dueAt: ago(1) }, NOW, today)?.kind).toBe("overdue");
  });

  it("stays quiet without a due date, when finished, or within three days of the last nudge", () => {
    expect(memberNudge(base, NOW, today)).toBeNull();
    expect(memberNudge({ ...base, stage: "complete", dueAt: ago(1) }, NOW, today)).toBeNull();
    expect(memberNudge({ ...base, dueAt: ago(1), lastNudgeAt: ago(2) }, NOW, today)).toBeNull();
    expect(memberNudge({ ...base, dueAt: ago(1), lastNudgeAt: ago(3) }, NOW, today)?.kind).toBe("overdue");
  });

  it("tells the admin about a recent completion or a week overdue, with stable keys", () => {
    expect(adminNotice({ ...base, stage: "complete", completedAt: ago(1) }, NOW)).toEqual({
      kind: "completed",
      key: "completed:m1",
    });
    expect(adminNotice({ ...base, stage: "complete", completedAt: ago(30) }, NOW)).toBeNull();
    expect(adminNotice({ ...base, dueAt: ago(6) }, NOW)).toBeNull();
    expect(adminNotice({ ...base, dueAt: ago(7) }, NOW)).toEqual({ kind: "overdue", key: "overdue:m1" });
    expect(adminNotice({ ...base, stage: "invited", dueAt: ago(8) }, NOW)?.kind).toBe("overdue");
  });
});
