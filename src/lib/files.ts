/**
 * Attachments, the pure part: what may be uploaded, how big, and how to tell
 * a file is what it says it is. Client-safe — the upload UI imports the
 * limits from here. Storage and auth live in src/lib/actions/files.ts.
 */

/** One chunk per request and per database row. Base64 of this stays well under 1 MB. */
export const CHUNK_BYTES = 512 * 1024;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Per club, across every attachment. A free Postgres tier is about 500 MB in all. */
export const DEFAULT_STORAGE_LIMIT_MB = 250;

export function storageLimitBytes(): number {
  const mb = Number(process.env.FILE_STORAGE_LIMIT_MB ?? DEFAULT_STORAGE_LIMIT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_STORAGE_LIMIT_MB) * 1024 * 1024;
}

type Kind = { mime: string; label: string; extensions: string[]; magic: (head: Uint8Array) => boolean };

const starts = (bytes: number[]) => (head: Uint8Array) => bytes.every((b, i) => head[i] === b);
const ascii = (head: Uint8Array, from: number, text: string) =>
  [...text].every((ch, i) => head[from + i] === ch.charCodeAt(0));
const zip = starts([0x50, 0x4b, 0x03, 0x04]);
/** Plain text has no signature; refuse anything with control bytes instead. */
const looksLikeText = (head: Uint8Array) =>
  head.every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127));

/**
 * Documents and pictures only. Nothing a browser would run: no HTML, no SVG,
 * no scripts. Every type has a signature that the first chunk must match, so
 * a renamed file is refused.
 */
export const ALLOWED_FILES: Kind[] = [
  { mime: "application/pdf", label: "PDF", extensions: ["pdf"], magic: (h) => ascii(h, 0, "%PDF-") },
  { mime: "image/png", label: "PNG", extensions: ["png"], magic: starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: "image/jpeg", label: "JPEG", extensions: ["jpg", "jpeg"], magic: starts([0xff, 0xd8, 0xff]) },
  { mime: "image/webp", label: "WebP", extensions: ["webp"], magic: (h) => ascii(h, 0, "RIFF") && ascii(h, 8, "WEBP") },
  {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PowerPoint",
    extensions: ["pptx"],
    magic: zip,
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
    extensions: ["docx"],
    magic: zip,
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
    extensions: ["xlsx"],
    magic: zip,
  },
  { mime: "text/csv", label: "CSV", extensions: ["csv"], magic: looksLikeText },
  { mime: "text/plain", label: "Text", extensions: ["txt"], magic: looksLikeText },
];

export const ACCEPT_ATTRIBUTE = ALLOWED_FILES.flatMap((k) => k.extensions.map((e) => `.${e}`)).join(",");

export function extensionOf(filename: string): string {
  return filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
}

/** The allowed type for a filename, decided by its extension — never by what the browser claims. */
export function fileTypeFor(filename: string): Kind | null {
  const ext = extensionOf(filename);
  return ALLOWED_FILES.find((k) => k.extensions.includes(ext)) ?? null;
}

export function matchesSignature(mime: string, head: Uint8Array): boolean {
  const kind = ALLOWED_FILES.find((k) => k.mime === mime);
  return kind ? kind.magic(head.subarray(0, 512)) : false;
}

/** A name safe to store, show and put in a download header. */
export function cleanFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f"<>|:*?\\/]/g, "").trim();
  return (base || "file").slice(0, 160);
}

export function chunkCountFor(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / CHUNK_BYTES));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export const FILE_KIND_LABEL = {
  deck: "Pitch deck",
  one_pager: "One-pager",
  budget: "Budget",
  receipt: "Receipt",
  legal: "Legal",
  other: "Other",
} as const;
