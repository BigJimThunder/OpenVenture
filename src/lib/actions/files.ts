"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { application, company, file, fileChunk, FILE_KINDS } from "@/db/schema";
import {
  chunkCountFor,
  CHUNK_BYTES,
  cleanFilename,
  FILE_KIND_LABEL,
  fileTypeFor,
  formatBytes,
  matchesSignature,
  MAX_FILE_BYTES,
  storageLimitBytes,
} from "@/lib/files";
import { atomic, guard, guardFailure, lock } from "@/lib/pipeline/atomic";
import { roleAtLeast } from "./context";
import { ActionError, authedAction } from "./safe-action";

/**
 * Attachments on an application: pitch decks, budgets, receipts.
 *
 * A file travels in chunks — one small server action each — so no request
 * and no database statement is ever larger than a chunk, whatever the host's
 * body limit. Nothing is listed or served until `finishUpload` has seen every
 * chunk. Downloads go through /api/files/[id], which checks the session.
 *
 * None of these are available to an access token.
 */

async function loadApplication(orgId: string, applicationId: string) {
  const [row] = await db
    .select({ id: application.id, companyId: application.companyId, companyName: company.name, erasedAt: application.erasedAt })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .where(and(eq(application.id, applicationId), eq(application.orgId, orgId)))
    .limit(1);
  if (!row) throw new ActionError("Application not found");
  return row;
}

export const startUpload = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    filename: z.string().min(1).max(300),
    sizeBytes: z.number().int().positive(),
    kind: z.enum(FILE_KINDS).default("other"),
  }),
  handler: async (input, ctx) => {
    const app = await loadApplication(ctx.org.id, input.applicationId);
    if (app.erasedAt) throw new ActionError("This applicant's data was erased; nothing more can be attached.");

    const filename = cleanFilename(input.filename);
    const type = fileTypeFor(filename);
    if (!type) {
      throw new ActionError("That file type can't be attached. Use a PDF, an image, or a PowerPoint, Word, Excel, CSV or text file.");
    }
    if (input.sizeBytes > MAX_FILE_BYTES) {
      throw new ActionError(`That file is ${formatBytes(input.sizeBytes)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`);
    }

    // The club's total is checked and the row reserved in one unit, so two
    // uploads starting together cannot both squeeze under the limit.
    const limit = storageLimitBytes();
    try {
      const results = await atomic((q) => [
        lock(q, "file-storage", ctx.org.id),
        guard(
          q,
          sql`coalesce((select sum(${file.sizeBytes}) from ${file} where ${file.orgId} = ${ctx.org.id}), 0) + ${input.sizeBytes} <= ${limit}`,
          "storage_full"
        ),
        q
          .insert(file)
          .values({
            orgId: ctx.org.id,
            applicationId: app.id,
            companyId: app.companyId,
            filename,
            mime: type.mime,
            sizeBytes: input.sizeBytes,
            kind: input.kind,
            status: "uploading",
            chunkCount: chunkCountFor(input.sizeBytes),
            uploadedByMemberId: ctx.member.id,
          })
          .returning({ id: file.id, chunkCount: file.chunkCount }),
      ]);
      const [row] = results[2] as { id: string; chunkCount: number }[];
      return { data: { fileId: row.id, chunkCount: row.chunkCount, chunkBytes: CHUNK_BYTES } };
    } catch (e) {
      if (guardFailure(e) === "storage_full") {
        throw new ActionError(
          `The club's attachment storage (${formatBytes(limit)}) is full. Remove files you no longer need, or ask an admin to raise FILE_STORAGE_LIMIT_MB.`
        );
      }
      throw e;
    }
  },
});

async function loadUpload(orgId: string, fileId: string, memberId: string) {
  const [row] = await db
    .select()
    .from(file)
    .where(and(eq(file.id, fileId), eq(file.orgId, orgId)))
    .limit(1);
  if (!row || row.status !== "uploading" || row.uploadedByMemberId !== memberId) {
    throw new ActionError("This upload is no longer open. Start again.");
  }
  return row;
}

export const uploadChunk = authedAction({
  minRole: "analyst",
  input: z.object({
    fileId: z.string().uuid(),
    seq: z.number().int().min(0),
    /** Base64 of at most CHUNK_BYTES. */
    data: z.string().min(1).max(Math.ceil((CHUNK_BYTES * 4) / 3) + 8),
  }),
  handler: async (input, ctx) => {
    const upload = await loadUpload(ctx.org.id, input.fileId, ctx.member.id);
    if (input.seq >= upload.chunkCount) throw new ActionError("Unexpected chunk");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw new ActionError("Chunk is not valid base64");
    const bytes = Buffer.from(input.data, "base64");
    const expected =
      input.seq === upload.chunkCount - 1 ? upload.sizeBytes - CHUNK_BYTES * (upload.chunkCount - 1) : CHUNK_BYTES;
    if (bytes.length !== expected) throw new ActionError("Chunk is the wrong size");

    // The first bytes must be what the extension promised.
    if (input.seq === 0 && !matchesSignature(upload.mime, bytes)) {
      await db.delete(file).where(eq(file.id, upload.id));
      throw new ActionError(`${upload.filename} isn't really that kind of file, so it wasn't attached.`);
    }

    const base64 = bytes.toString("base64");
    await db
      .insert(fileChunk)
      .values({ fileId: upload.id, seq: input.seq, data: sql`decode(${base64}, 'base64')` })
      .onConflictDoUpdate({
        target: [fileChunk.fileId, fileChunk.seq],
        set: { data: sql`decode(${base64}, 'base64')` },
      });
    return { data: { ok: true } };
  },
});

export const finishUpload = authedAction({
  minRole: "analyst",
  input: z.object({ fileId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const upload = await loadUpload(ctx.org.id, input.fileId, ctx.member.id);
    const [stored] = await db
      .select({
        chunks: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(octet_length(${fileChunk.data})), 0)::int`,
      })
      .from(fileChunk)
      .where(eq(fileChunk.fileId, upload.id));
    if (stored.chunks !== upload.chunkCount || stored.bytes !== upload.sizeBytes) {
      await db.delete(file).where(eq(file.id, upload.id));
      throw new ActionError("The upload didn't arrive complete. Please try again.");
    }
    await db.update(file).set({ status: "ready" }).where(eq(file.id, upload.id));

    const app = upload.applicationId ? await loadApplication(ctx.org.id, upload.applicationId) : null;
    if (app) revalidatePath(`/pipeline/${app.id}`);
    return {
      data: { fileId: upload.id },
      activity: {
        verb: "file.attached",
        entityType: "application",
        entityId: upload.applicationId ?? upload.id,
        entityLabel: app?.companyName,
        summary: `${ctx.member.displayName} attached ${FILE_KIND_LABEL[upload.kind].toLowerCase()} “${upload.filename}”${app ? ` to ${app.companyName}` : ""}`,
      },
    };
  },
});

export const deleteFile = authedAction({
  minRole: "analyst",
  input: z.object({ fileId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(file)
      .where(and(eq(file.id, input.fileId), eq(file.orgId, ctx.org.id)))
      .limit(1);
    if (!row) throw new ActionError("File not found");
    // Your own uploads, or any file if you are a partner or admin.
    if (row.uploadedByMemberId !== ctx.member.id && !roleAtLeast(ctx.member.role, "partner")) {
      throw new ActionError("Only the person who attached this, or a partner, can remove it.");
    }
    await db.delete(file).where(eq(file.id, row.id)); // chunks go with it
    if (row.applicationId) revalidatePath(`/pipeline/${row.applicationId}`);
    return {
      data: { ok: true },
      activity: {
        verb: "file.removed",
        entityType: "application",
        entityId: row.applicationId ?? row.id,
        summary: `${ctx.member.displayName} removed the attachment “${row.filename}”`,
      },
    };
  },
});
