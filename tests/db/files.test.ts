import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb as db, driver } from "./db";
import { actAs } from "./world";
import { addApplication, seedClub, type Person } from "./fixtures";
import { apiToken, file, fileChunk } from "../../src/db/schema";
import { withTokenAuth } from "../../src/lib/actions/context";
import { deleteFile, finishUpload, startUpload, uploadChunk } from "../../src/lib/actions/files";
import { eraseApplicantData } from "../../src/lib/actions/privacy";
import { CHUNK_BYTES } from "../../src/lib/files";
import { generateToken } from "../../src/lib/mcp/tokens";
import { getApplicationFiles, getReadyFile, readChunk } from "../../src/lib/queries/files";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const pdf = (size: number) => Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(size - 9)]);

async function upload(who: Person, applicationId: string, filename: string, bytes: Buffer) {
  const started = await actAs(who.as, () =>
    startUpload({ applicationId, filename, sizeBytes: bytes.length, kind: "deck" })
  );
  if (!started.ok) return started;
  const { fileId, chunkCount } = started.data;
  for (let seq = 0; seq < chunkCount; seq++) {
    const data = bytes.subarray(seq * CHUNK_BYTES, (seq + 1) * CHUNK_BYTES).toString("base64");
    const sent = await actAs(who.as, () => uploadChunk({ fileId, seq, data }));
    if (!sent.ok) return sent;
  }
  return actAs(who.as, () => finishUpload({ fileId }));
}

afterEach(() => {
  delete process.env.FILE_STORAGE_LIMIT_MB;
});

describe(`attachments (${driver})`, () => {
  it("a multi-chunk file comes back byte for byte", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[0].id);
    const original = pdf(CHUNK_BYTES * 2 + 12_345); // three chunks, the last one short

    const done = await upload(people.analyst, app.id, "Deck.pdf", original);
    expect(done).toMatchObject({ ok: true });
    const [listed] = await getApplicationFiles(org.id, app.id);
    expect(listed).toMatchObject({ filename: "Deck.pdf", mime: "application/pdf", sizeBytes: original.length, kind: "deck" });

    const row = await getReadyFile(org.id, listed.id);
    expect(row!.chunkCount).toBe(3);
    const parts: Buffer[] = [];
    for (let seq = 0; seq < row!.chunkCount; seq++) parts.push((await readChunk(row!.id, seq))!);
    expect(sha(Buffer.concat(parts))).toBe(sha(original));
  });

  it("nothing is listed or readable until the upload is finished", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[0].id);
    const bytes = pdf(4000);
    const started = await actAs(people.analyst.as, () =>
      startUpload({ applicationId: app.id, filename: "half.pdf", sizeBytes: bytes.length, kind: "other" })
    );
    if (!started.ok) throw new Error("start failed");
    expect(await getApplicationFiles(org.id, app.id)).toHaveLength(0);
    expect(await getReadyFile(org.id, started.data.fileId)).toBeNull();
    // Finishing without the bytes fails and leaves nothing behind.
    expect((await actAs(people.analyst.as, () => finishUpload({ fileId: started.data.fileId }))).ok).toBe(false);
    expect(await db.select().from(file)).toHaveLength(0);
  });

  it("refuses types a browser could run, and files that are not what their name says", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[0].id);
    for (const name of ["page.html", "logo.svg", "tool.exe", "x.pdf.js"]) {
      const res = await actAs(people.analyst.as, () =>
        startUpload({ applicationId: app.id, filename: name, sizeBytes: 100, kind: "other" })
      );
      expect(res.ok, name).toBe(false);
    }
    // HTML wearing a .pdf name is caught on its first bytes, and nothing is kept.
    const disguised = Buffer.from("<html><script>alert(1)</script></html>".padEnd(600, " "));
    const res = await upload(people.analyst, app.id, "deck.pdf", disguised);
    expect(res.ok).toBe(false);
    expect(await db.select().from(file)).toHaveLength(0);
    expect(await db.select().from(fileChunk)).toHaveLength(0);
  });

  it("enforces the size of every chunk, the file limit and the club's storage limit", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[0].id);
    const tooBig = await actAs(people.analyst.as, () =>
      startUpload({ applicationId: app.id, filename: "huge.pdf", sizeBytes: 21 * 1024 * 1024, kind: "deck" })
    );
    expect(tooBig).toMatchObject({ ok: false });

    const bytes = pdf(3000);
    const started = await actAs(people.analyst.as, () =>
      startUpload({ applicationId: app.id, filename: "a.pdf", sizeBytes: bytes.length, kind: "deck" })
    );
    if (!started.ok) throw new Error("start failed");
    // A chunk that is not exactly the size the file declared is refused.
    const short = await actAs(people.analyst.as, () =>
      uploadChunk({ fileId: started.data.fileId, seq: 0, data: bytes.subarray(0, 2000).toString("base64") })
    );
    expect(short.ok).toBe(false);

    process.env.FILE_STORAGE_LIMIT_MB = "1";
    expect((await upload(people.analyst, app.id, "one.pdf", pdf(700 * 1024))).ok).toBe(true);
    const over = await upload(people.analyst, app.id, "two.pdf", pdf(700 * 1024));
    expect(over.ok).toBe(false);
    expect((over as { error: string }).error).toMatch(/storage .* is full/);
  });

  it("only contributing members attach; a file belongs to its club; tokens cannot upload", async () => {
    const a = await seedClub();
    const b = await seedClub();
    const { application: app } = await addApplication(a.org.id, a.stages[0].id);
    const input = { applicationId: app.id, filename: "d.pdf", sizeBytes: 500, kind: "deck" as const };

    expect(await actAs(a.people.read_only.as, () => startUpload(input))).toMatchObject({ ok: false, code: "forbidden" });
    expect(await actAs({}, () => startUpload(input))).toMatchObject({ ok: false, code: "auth" });
    // Another club's member cannot attach to this application…
    expect((await actAs(b.people.admin.as, () => startUpload(input))).ok).toBe(false);

    const done = await upload(a.people.analyst, app.id, "d.pdf", pdf(500));
    const fileId = (done as { ok: true; data: { fileId: string } }).data.fileId;
    // …or see, read or remove its files.
    expect(await getReadyFile(b.org.id, fileId)).toBeNull();
    expect((await actAs(b.people.admin.as, () => deleteFile({ fileId }))).ok).toBe(false);

    const t = generateToken();
    await db.insert(apiToken).values({ orgId: a.org.id, memberId: a.people.admin.member.id, name: "t", tokenHash: t.tokenHash, prefix: t.prefix, scope: "write" });
    const viaToken = await actAs({ headers: { authorization: `Bearer ${t.token}` } }, () => withTokenAuth(() => startUpload(input)));
    expect(viaToken).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("the uploader or a partner can remove a file; erasing an applicant removes theirs", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[0].id);
    const first = (await upload(people.partner, app.id, "p.pdf", pdf(900))) as { ok: true; data: { fileId: string } };
    // Another analyst did not upload it and is not a partner.
    expect((await actAs(people.analyst.as, () => deleteFile({ fileId: first.data.fileId }))).ok).toBe(false);
    expect((await actAs(people.admin.as, () => deleteFile({ fileId: first.data.fileId }))).ok).toBe(true);
    expect(await db.select().from(fileChunk)).toHaveLength(0);

    await upload(people.analyst, app.id, "receipt.pdf", pdf(1200));
    expect(await db.select().from(file).where(eq(file.applicationId, app.id))).toHaveLength(1);
    expect((await actAs(people.admin.as, () => eraseApplicantData({ applicationId: app.id }))).ok).toBe(true);
    expect(await db.select().from(file)).toHaveLength(0);
    expect(await db.select().from(fileChunk)).toHaveLength(0);
  });
});
