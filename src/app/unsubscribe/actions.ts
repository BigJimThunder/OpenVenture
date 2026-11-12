"use server";

import { redirect } from "next/navigation";
import { verifyUnsubscribe } from "@/lib/email";
import { setEmailPref } from "@/lib/email-prefs";

/**
 * Public by design: the person clicking has no session, only the signed link
 * from their own email. The signature binds member and category, and the only
 * thing it can do is switch that one kind of email off (or back on).
 */
export async function setSubscription(formData: FormData) {
  const memberId = String(formData.get("m") ?? "");
  const category = String(formData.get("c") ?? "");
  const signature = String(formData.get("s") ?? "");
  const on = formData.get("on") === "1";
  if (!verifyUnsubscribe(memberId, category, signature)) redirect("/unsubscribe");
  await setEmailPref(memberId, category, on);
  const query = new URLSearchParams({ m: memberId, c: category, s: signature, done: on ? "on" : "off" });
  redirect(`/unsubscribe?${query}`);
}
