import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deliveryProblem, verifyResendWebhook } from "./resend-webhook";

const key = Buffer.from("a-webhook-signing-key-of-some-length");
const secret = `whsec_${key.toString("base64")}`;
const now = 1_800_000_000_000;
const sign = (id: string, ts: string, body: string, k = key) =>
  `v1,${createHmac("sha256", k).update(`${id}.${ts}.${body}`).digest("base64")}`;

describe("verifyResendWebhook", () => {
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });
  const ts = String(now / 1000);

  it("accepts a correctly signed, recent delivery", () => {
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(true);
  });

  it("accepts any one of several signatures (secret rotation)", () => {
    const signature = `${sign("msg_1", ts, body, Buffer.from("old key"))} ${sign("msg_1", ts, body)}`;
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: ts, signature }, body, now)).toBe(true);
  });

  it("rejects a changed body, a wrong key, a missing header and an old timestamp", () => {
    const good = sign("msg_1", ts, body);
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: ts, signature: good }, body + " ", now)).toBe(false);
    expect(
      verifyResendWebhook(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body, Buffer.from("nope")) }, body, now)
    ).toBe(false);
    expect(verifyResendWebhook(secret, { id: null, timestamp: ts, signature: good }, body, now)).toBe(false);
    expect(verifyResendWebhook("", { id: "msg_1", timestamp: ts, signature: good }, body, now)).toBe(false);
    const old = String(now / 1000 - 3600);
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: old, signature: sign("msg_1", old, body) }, body, now)).toBe(false);
  });
});

describe("deliveryProblem", () => {
  it("reads hard bounces and complaints, lower-casing the addresses", () => {
    expect(deliveryProblem({ type: "email.bounced", data: { to: ["Ana@Club.test"], bounce: { type: "Permanent" } } })).toEqual({
      kind: "bounced",
      addresses: ["ana@club.test"],
    });
    expect(deliveryProblem({ type: "email.complained", data: { to: "x@y.test" } })).toEqual({
      kind: "complained",
      addresses: ["x@y.test"],
    });
  });

  it("ignores soft bounces and every other event", () => {
    expect(deliveryProblem({ type: "email.bounced", data: { to: ["a@b.test"], bounce: { type: "Transient" } } })).toBeNull();
    expect(deliveryProblem({ type: "email.delivered", data: { to: ["a@b.test"] } })).toBeNull();
    expect(deliveryProblem({ type: "email.bounced", data: {} })).toBeNull();
    expect(deliveryProblem("nonsense")).toBeNull();
  });
});
