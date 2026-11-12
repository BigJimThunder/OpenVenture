import type { OnboardingTaskKind } from "@/db/schema";

/**
 * What an onboarding item is, as the member meets it. The stored `kind` is one
 * of five strings; this file is the only place that decides what each means on
 * screen, and the only place a pasted URL is turned into an embeddable player.
 *
 * `submit` is the acknowledgment: the member submits their agreement to the
 * policy text held in the item's description.
 */
export const KIND_META: Record<
  OnboardingTaskKind,
  { label: string; noun: string; confirm: string; hint: string }
> = {
  read: {
    label: "Article",
    noun: "reading",
    confirm: "I've read this",
    hint: "A link or one of the club's docs. The member confirms they read it.",
  },
  watch: {
    label: "Video",
    noun: "video",
    confirm: "I've watched this",
    hint: "YouTube, Vimeo and Loom links play inside the flow. Anything else opens in a new tab.",
  },
  submit: {
    label: "Acknowledgment",
    noun: "acknowledgment",
    confirm: "I agree",
    hint: "A short policy the member has to agree to, such as confidentiality.",
  },
  do: {
    label: "Task",
    noun: "task",
    confirm: "Mark as done",
    hint: "Something to do in the app or in person. The member marks it done.",
  },
  meet: {
    label: "Meet",
    noun: "meeting",
    confirm: "Mark as done",
    hint: "Sit in on something or meet someone. The member marks it done.",
  },
};

/** The order kinds are offered in when building a track. */
export const KIND_ORDER: OnboardingTaskKind[] = ["read", "watch", "submit", "do", "meet"];

export type VideoEmbed = {
  provider: "YouTube" | "Vimeo" | "Loom";
  /** A privacy-friendly player URL built from a validated id — never the pasted string. */
  embedUrl: string;
};

/** http(s) URLs only. Returns null for anything else, including `javascript:`. */
export function safeHttpUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const LOOM_ID = /^[a-f0-9]{32}$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = parts[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "vimeo.com") id = parts.find((p) => /^\d+$/.test(p)) ?? null;
  else if (host === "player.vimeo.com" && parts[0] === "video") id = parts[1] ?? null;
  return id && VIMEO_ID.test(id) ? id : null;
}

function loomId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host !== "loom.com" || !["share", "embed"].includes(parts[0] ?? "")) return null;
  const id = parts[1] ?? "";
  return LOOM_ID.test(id) ? id : null;
}

/** The embeddable player for a recognized video link, or null (link out instead). */
export function videoEmbed(raw: string | null | undefined): VideoEmbed | null {
  const url = safeHttpUrl(raw);
  if (!url || url.protocol !== "https:") return null;
  const yt = youtubeId(url);
  if (yt) return { provider: "YouTube", embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0` };
  const vimeo = vimeoId(url);
  if (vimeo) return { provider: "Vimeo", embedUrl: `https://player.vimeo.com/video/${vimeo}?dnt=1` };
  const loom = loomId(url);
  if (loom) return { provider: "Loom", embedUrl: `https://www.loom.com/embed/${loom}` };
  return null;
}

/** A pasted link is a video if we can play it, an article otherwise. */
export function detectKind(raw: string): { kind: "read" | "watch"; provider: string | null } | null {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  const embed = videoEmbed(raw);
  return embed ? { kind: "watch", provider: embed.provider } : { kind: "read", provider: null };
}

/** "example.com" for showing where a link goes before the member opens it. */
export function linkHost(raw: string | null | undefined): string | null {
  return safeHttpUrl(raw)?.hostname.replace(/^www\./, "") ?? null;
}
