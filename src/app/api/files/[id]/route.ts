import { NextResponse } from "next/server";
import { getCtx } from "@/lib/actions/context";
import { getReadyFile, readChunk } from "@/lib/queries/files";
import { reportError } from "@/lib/report-error";

/**
 * Download an attachment. Members of the club only — the file has no public
 * URL at all. Sent one stored chunk at a time.
 *
 * Whatever the file is, the browser is told to save it rather than render it
 * (images may be shown inline with `?inline=1`), not to guess its type, and
 * to run nothing from it. Uploads are limited to documents and pictures, but
 * this response would be safe even for a file that slipped through.
 */

export const dynamic = "force-dynamic";

const INLINE_OK = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await getReadyFile(ctx.org.id, id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let seq = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (seq >= row.chunkCount) return controller.close();
        const chunk = await readChunk(row.id, seq++);
        if (!chunk) throw new Error(`chunk ${seq - 1} of file ${row.id} is missing`);
        controller.enqueue(chunk);
      } catch (e) {
        reportError("files", e, { file: row.id });
        controller.error(e);
      }
    },
  });

  const inline = new URL(req.url).searchParams.get("inline") === "1" && INLINE_OK.has(row.mime);
  // RFC 5987: an ASCII fallback plus the real (possibly non-ASCII) name.
  const fallback = row.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return new Response(body, {
    headers: {
      "content-type": row.mime,
      "content-length": String(row.sizeBytes),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
