import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { file, fileChunk, member, type FileKind } from "@/db/schema";
import { sql } from "drizzle-orm";

export type AttachedFile = {
  id: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  kind: FileKind;
  uploadedByMemberId: string | null;
  uploadedByName: string | null;
  createdAt: Date;
};

/** Finished attachments on one application, newest first. */
export async function getApplicationFiles(orgId: string, applicationId: string): Promise<AttachedFile[]> {
  return db
    .select({
      id: file.id,
      filename: file.filename,
      mime: file.mime,
      sizeBytes: file.sizeBytes,
      kind: file.kind,
      uploadedByMemberId: file.uploadedByMemberId,
      uploadedByName: member.displayName,
      createdAt: file.createdAt,
    })
    .from(file)
    .leftJoin(member, eq(file.uploadedByMemberId, member.id))
    .where(and(eq(file.orgId, orgId), eq(file.applicationId, applicationId), eq(file.status, "ready")))
    .orderBy(desc(file.createdAt));
}

/** A finished file's row, scoped to the org. */
export async function getReadyFile(orgId: string, fileId: string) {
  const [row] = await db
    .select()
    .from(file)
    .where(and(eq(file.id, fileId), eq(file.orgId, orgId), eq(file.status, "ready")))
    .limit(1);
  return row ?? null;
}

/** One chunk's bytes. Read one at a time so a download never holds the whole file. */
export async function readChunk(fileId: string, seq: number): Promise<Buffer | null> {
  const [row] = await db
    .select({ data: sql<string>`encode(${fileChunk.data}, 'base64')` })
    .from(fileChunk)
    .where(and(eq(fileChunk.fileId, fileId), eq(fileChunk.seq, seq)))
    .orderBy(asc(fileChunk.seq))
    .limit(1);
  return row ? Buffer.from(row.data, "base64") : null;
}
