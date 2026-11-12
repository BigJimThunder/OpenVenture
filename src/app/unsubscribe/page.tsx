import type { Metadata } from "next";
import { verifyUnsubscribe } from "@/lib/email";
import { EMAIL_CATEGORY_COPY, unsubscribeSubject } from "@/lib/email-prefs";
import { Button } from "@/components/ui/button";
import { AuthFrame } from "../(auth)/auth-frame";
import { setSubscription } from "./actions";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };

/**
 * Where the "Turn them off" link in a scheduled email lands. No sign-in: the
 * signed link is the proof. A button, not an automatic action, so a mail
 * scanner that opens links cannot unsubscribe anyone.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const memberId = one(params.m);
  const category = one(params.c);
  const signature = one(params.s);
  const done = one(params.done);

  const subject = verifyUnsubscribe(memberId, category, signature) ? await unsubscribeSubject(memberId) : null;
  if (!subject || !verifyUnsubscribe(memberId, category, signature)) {
    return (
      <AuthFrame
        title="This link doesn't work"
        description="It may have been cut off by your mail app. You can change which emails you get from your profile in the app."
      />
    );
  }

  const copy = EMAIL_CATEGORY_COPY[category];
  const isOff = subject.prefs[category] === false;
  const hidden = (
    <>
      <input type="hidden" name="m" value={memberId} />
      <input type="hidden" name="c" value={category} />
      <input type="hidden" name="s" value={signature} />
    </>
  );

  return (
    <AuthFrame
      title={isOff ? `${copy.label} is off` : `Turn off the ${copy.label.toLowerCase()}?`}
      description={
        isOff
          ? `${subject.orgName} won't send this to ${subject.email}. Sign-in emails and messages a member sends you directly still arrive.`
          : `${copy.description} Sent by ${subject.orgName} to ${subject.email}.`
      }
      footer="You can change this any time from your profile in the app."
    >
      <form action={setSubscription} className="flex flex-col gap-3">
        {hidden}
        <input type="hidden" name="on" value={isOff ? "1" : "0"} />
        {done ? (
          <p role="status" className="text-sm text-fg-muted">
            {done === "off" ? "Done. You won't get these." : "Done. These are back on."}
          </p>
        ) : null}
        <Button type="submit" size="lg" variant={isOff ? "secondary" : "default"} className="h-11">
          {isOff ? "Turn it back on" : "Turn it off"}
        </Button>
      </form>
    </AuthFrame>
  );
}
