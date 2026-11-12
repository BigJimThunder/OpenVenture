import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getRevealedOutcomeBallots, getMemberSectorAffinity } from "@/lib/queries/insights";
import { yesRate, calibration, contrarianRecord } from "@/lib/insights/calibration";
import { formatPct } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { StageBadge } from "@/components/patterns/stage-badge";
import { Panel } from "@/components/patterns/data-panel";
import { BarList } from "@/components/patterns/data-bar-list";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "My investor profile" };
export const dynamic = "force-dynamic";

/** Below this many data points we say so instead of drawing conclusions. */
const THIN = 5;

/**
 * Investor self-analysis. The tone is the design: this page is a coach, not
 * a scoreboard. Nothing here is ranked against other members, nothing is
 * colored as pass/fail, and thin samples are called thin.
 */
export default async function SelfInsightsPage() {
  const ctx = await requireCtx();
  const [ballots, affinity] = await Promise.all([
    getRevealedOutcomeBallots(ctx.org.id),
    getMemberSectorAffinity(ctx.org.id, ctx.member.id),
  ]);

  const yr = yesRate(ballots, ctx.member.id);
  const cal = calibration(ballots, ctx.member.id);
  const contrarian = contrarianRecord(ballots, ctx.member.id);
  const firstName = ctx.member.displayName.split(/\s+/)[0];

  const voteRead =
    yr.mine == null || yr.club == null
      ? null
      : yr.myVotes < THIN
        ? `That is from ${yr.myVotes} ${yr.myVotes === 1 ? "vote" : "votes"} — too few to call it a pattern yet.`
        : Math.abs(yr.mine - yr.club) < 0.1
          ? "You say yes about as often as the room does."
          : yr.mine > yr.club
            ? "You say yes more often than the room. That is a style, not a flaw — optimists find the outliers. It is worth knowing about yourself when the budget is tight."
            : "You say yes less often than the room. A high bar is a style, not a flaw — it is worth asking now and then what a yes would have cost you.";

  const outcomesSeen = cal.winnersCount + cal.dormantCount;
  const calibrationRead =
    cal.spread == null
      ? "This fills in once you have voted on companies that went on to do well and on ones that went quiet. That takes a year or two — outcomes are slow."
      : outcomesSeen < THIN
        ? "A first signal, from very few companies. Treat it as a question, not an answer."
        : cal.spread > 0.25
          ? "When you were more sure, the company more often went somewhere. Your conviction is carrying real information — say it out loud in the room."
          : cal.spread < -0.25
            ? "So far, the companies you felt strongest about have not been the ones that worked out. That happens to every investor. It is worth looking back at what made you sure."
            : "Your conviction has been about the same on the ones that worked and the ones that did not. Try using the full 1–5 range: save the 5s for when you would argue for it.";

  const question =
    contrarian.length === 0 && yr.myVotes >= THIN
      ? "You have voted with the room every time so far. Next vote, write your rationale before you imagine what anyone else will say."
      : cal.spread != null && cal.spread < -0.25
        ? "Pick one company you gave a 5 that went quiet. What did you believe about it that turned out not to matter?"
        : affinity.length === 1
          ? `Everything you have sourced is in ${affinity[0].sectorName}. Who on campus is building something you would not normally hear about?`
          : "Before the next vote, write down one thing that would change your mind. Check it at the next check-in.";

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow={
          <Link href="/insights" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeftIcon className="size-3" />
            Insights
          </Link>
        }
        title="My investor profile"
        description="A mirror, not a grade. It shows how you have voted and what happened next, so you can notice your own habits."
      />

      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 md:px-6">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-subtle/60 p-3.5 text-sm text-fg-muted">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <p>
            <span className="font-medium text-fg">Only you can open this page, {firstName}.</span>{" "}
            Partners and admins cannot see it, and nothing here ranks you against another member.
            It is built from votes that have already been revealed and outcomes the club has
            recorded.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Panel title="How often you say yes" note="fund vs decline, abstentions left out">
            {yr.mine == null ? (
              <Waiting>
                Appears after the first vote you take part in is revealed.
              </Waiting>
            ) : (
              <>
                <BarList
                  max={1}
                  items={[
                    {
                      key: "you",
                      label: "You",
                      value: yr.mine,
                      display: formatPct(yr.mine, 0),
                      note: `${yr.myVotes} ${yr.myVotes === 1 ? "vote" : "votes"}`,
                    },
                    ...(yr.club != null
                      ? [{ key: "club", label: "The club", value: yr.club, display: formatPct(yr.club, 0) }]
                      : []),
                  ]}
                />
                {voteRead && <Read>{voteRead}</Read>}
              </>
            )}
          </Panel>

          <Panel title="When you were sure, were you right?" note="average conviction, 1–5">
            {cal.onWinners == null && cal.onDormant == null ? (
              <Waiting>{calibrationRead}</Waiting>
            ) : (
              <>
                <BarList
                  max={5}
                  items={[
                    {
                      key: "winners",
                      label: "Companies that reached revenue or better",
                      value: cal.onWinners ?? 0,
                      display: cal.onWinners != null ? cal.onWinners.toFixed(1) : "—",
                      note: `${cal.winnersCount} ${cal.winnersCount === 1 ? "company" : "companies"}`,
                    },
                    {
                      key: "dormant",
                      label: "Companies that went quiet",
                      value: cal.onDormant ?? 0,
                      display: cal.onDormant != null ? cal.onDormant.toFixed(1) : "—",
                      note: `${cal.dormantCount} ${cal.dormantCount === 1 ? "company" : "companies"}`,
                    },
                  ]}
                />
                <Read>{calibrationRead}</Read>
              </>
            )}
          </Panel>

          <Panel title="When you disagreed with the room" note="revealed votes only">
            {contrarian.length === 0 ? (
              <Waiting>
                {yr.myVotes === 0
                  ? "Appears once a vote you took part in is revealed."
                  : "You have landed with the majority in every revealed vote so far. Votes are blind so that agreeing is a choice, not a habit."}
              </Waiting>
            ) : (
              <ul className="divide-y divide-border">
                {contrarian.map((c) => (
                  <li key={c.roundId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-sm">
                    <span>
                      You voted to <span className="font-medium">{c.myVote}</span>; most of the room
                      did not
                    </span>
                    <Badge variant={c.vindicated ? "info" : "neutral"}>
                      {c.vindicated == null
                        ? "Too early to tell"
                        : c.vindicated
                          ? "It went your way"
                          : "The room had it"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Where you find companies" note="applications you sourced, by sector">
            {affinity.length === 0 ? (
              <Waiting>
                Bring the club a company — set yourself as the source on its application — and your
                map starts here.
              </Waiting>
            ) : (
              <div className="flex flex-wrap gap-1.5 p-3.5">
                {affinity.map((a) => (
                  <StageBadge key={a.sectorName} name={`${a.sectorName} · ${a.sourced}`} colorToken={a.colorToken} />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
          <div className="text-xs text-fg-muted">One thing to try</div>
          <p className="mt-1 max-w-prose text-base">{question}</p>
        </div>
      </div>
    </div>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="px-3.5 py-6 text-sm text-fg-muted">{children}</p>;
}

/** The coach's one-line reading of a chart. */
function Read({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-border px-3.5 py-3 text-sm text-fg-muted">{children}</p>;
}
