/* eslint-disable @next/next/no-img-element -- member-supplied image links on any host; there is no upload storage to optimise from */
import * as React from "react";
import { RichTextView } from "@/components/editor/rich-text-view";
import { cn, initials } from "@/lib/utils";
import { formatFounder, type Founder, type Publication as PublicationData, type SectionId } from "@/lib/reports/annual";
import styles from "./publication.module.css";

const PAGE_TOP = "19mm";
const PAGE_SIDE = "20mm";

/** A string literal safe inside a CSS `content:` declaration. */
function cssString(text: string) {
  return `"${text.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f<>]/g, " ")}"`;
}

/**
 * Page boxes. Each section (and each company) gets a named page so the
 * running footer can say which part of the report you are in, the way a
 * printed annual report does; a change of page name also forces the page
 * break. The cover prints edge to edge with no footer.
 */
function pageCss(pub: PublicationData, footers: { page: string; text: string }[]) {
  const footer = (text: string) =>
    `@bottom-right { content: ${cssString(text)}; font: 600 8pt ui-sans-serif, system-ui, sans-serif; color: #5b6070; padding-bottom: 9mm; }`;
  return [
    `@page { size: Letter; margin: ${PAGE_TOP} ${PAGE_SIDE} 22mm; @bottom-left { content: counter(page); font: 500 8pt ui-sans-serif, system-ui, sans-serif; color: #8b90a0; padding-bottom: 9mm; } ${footer(`${pub.orgName} · ${pub.cover.title}`)} }`,
    `@page ov-cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }`,
    ...footers.map((f) => `@page ${f.page} { ${footer(f.text)} }`),
  ].join("\n");
}

function Founders({ founders }: { founders: Founder[] }) {
  return (
    <>
      {founders.map((f, i) => {
        const [first, ...rest] = formatFounder(f).split(" ");
        return (
          <React.Fragment key={i}>
            {i > 0 && " & "}
            <b>{first}</b> {rest.join(" ")}
          </React.Fragment>
        );
      })}
    </>
  );
}

function Figure({ url, caption, className }: { url: string; caption: string; className?: string }) {
  return (
    <figure className={cn(styles.figure, className)}>
      <img src={url} alt={caption} referrerPolicy="no-referrer" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/**
 * The report as its readers see it. No hooks and no client state, so the
 * same component renders the reader page on the server, the PDF, and the
 * builder's live preview.
 *
 * `draft` shows quiet placeholders where a section has nothing in it yet;
 * they never print.
 */
export function Publication({ pub, draft = false }: { pub: PublicationData; draft?: boolean }) {
  const anchor = (id: string) => `ar-${id}`;
  const footers: { page: string; text: string }[] = [];
  const pageFor = (key: string, text: string) => {
    const page = `ov-p${footers.length}`;
    footers.push({ page, text: `${pub.orgName} on ${text}` });
    return { page, key };
  };

  const placeholder = (text: string) => (draft ? <p className={styles.empty}>{text}</p> : null);

  const body: Record<SectionId, (title: string) => React.ReactNode> = {
    team: (title) => (
      <section key="team" id={anchor("team")} className={styles.sheet} style={{ page: pageFor("team", title).page }}>
        <header className={styles.band}>
          <h1 className={styles.h1}>{title}</h1>
          {pub.team.statement ? (
            <RichTextView value={pub.team.statement} />
          ) : (
            placeholder("The team statement goes here.")
          )}
        </header>
        {pub.team.members.some((m) => m.photoUrl) ? (
          <div className={styles.members}>
            {pub.team.members.map((m) => (
              <div key={m.id} className={styles.member}>
                {m.photoUrl ? (
                  <img className={styles.memberPhoto} src={m.photoUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <div className={styles.monogram} aria-hidden>
                    {initials(m.name)}
                  </div>
                )}
                <div>
                  <div className={styles.memberName}>{m.name}</div>
                  <div className={styles.memberTitle}>{m.title}</div>
                  {m.bio && <p className={styles.memberBio}>{m.bio}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.membersPlain}>
            {pub.team.members.map((m) => (
              <div key={m.id} className={styles.member}>
                <div className={styles.memberName}>{m.name}</div>
                <div className={styles.memberTitle}>{m.title}</div>
                {m.bio && <p className={styles.memberBio}>{m.bio}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    ),

    mission: (title) => (
      <section
        key="mission"
        id={anchor("mission")}
        className={styles.sheet}
        style={{ page: pageFor("mission", title).page }}
      >
        <div className={pub.mission.stats.length > 0 ? styles.split : undefined}>
          {pub.mission.stats.length > 0 && (
            <aside className={styles.sidebar}>
              <div className={styles.sidebarLabel}>
                {pub.inProgress ? "Activity so far" : "On activity"}
              </div>
              {pub.mission.stats.map((s) => (
                <div key={s.id} className={styles.stat}>
                  <div className={styles.statValue}>{s.value}</div>
                  <div className={styles.statLabel}>{s.label}</div>
                </div>
              ))}
              <div className={styles.sidebarMark}>{pub.orgName}</div>
            </aside>
          )}
          <div className={styles.main}>
            <h1 className={styles.h1}>{title}</h1>
            <div className={styles.byline}>By the {pub.orgName} team</div>
            {pub.mission.blocks.length === 0 && placeholder("Your mission and thesis go here.")}
            {pub.mission.blocks.map((b, i) => (
              <React.Fragment key={b.id}>
                {b.heading && (
                  <h2 className={styles.h2} style={i === 0 ? { marginTop: 0 } : undefined}>
                    {b.heading}
                  </h2>
                )}
                <RichTextView value={b.body} />
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>
    ),

    companies: () => (
      <React.Fragment key="companies">
        {pub.companies.map((c) => (
          <section
            key={c.id}
            id={anchor(`company-${c.id}`)}
            className={styles.sheet}
            style={{ page: pageFor(c.id, c.name).page }}
          >
            <header className={styles.companyHead}>
              {c.logoUrl ? (
                <img className={styles.logo} src={c.logoUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className={styles.logoMark} aria-hidden>
                  {c.name.slice(0, 1)}
                </div>
              )}
              <div>
                <p className={styles.companyLine}>
                  <strong>{c.name}</strong>
                  {c.oneLiner && <> — {c.oneLiner.replace(/[.]+$/, "")}.</>}
                </p>
                {c.founders.length > 0 && (
                  <p className={styles.founders}>
                    <Founders founders={c.founders} />
                  </p>
                )}
                <p className={styles.grantLine}>{c.grantLine}</p>
              </div>
            </header>

            <h1 className={styles.h1}>Our thesis on {c.name}</h1>
            <div className={styles.byline}>
              {c.author ? `By ${c.author.name}, ${c.author.title}` : `By the ${pub.orgName} team`}
            </div>
            {c.photos[0] && <Figure url={c.photos[0].url} caption={c.photos[0].caption} className={styles.lead} />}
            {c.essay ? <RichTextView value={c.essay} /> : placeholder("The essay goes here.")}

            {c.progress && (
              <div className={styles.progress}>
                <h2 className={styles.h2}>Current progress</h2>
                <RichTextView value={c.progress} />
              </div>
            )}
            {c.photos.length > 1 && (
              <div className={styles.photos}>
                {c.photos.slice(1).map((p) => (
                  <Figure key={p.id} url={p.url} caption={p.caption} />
                ))}
              </div>
            )}
          </section>
        ))}
      </React.Fragment>
    ),

    programs: (title) => (
      <section
        key="programs"
        id={anchor("programs")}
        className={styles.sheet}
        style={{ page: pageFor("programs", title).page }}
      >
        <h1 className={styles.h1}>{title}</h1>
        <div className={styles.byline}>By the {pub.orgName} team</div>
        {pub.programs.map((p) => (
          <div key={p.id} className={styles.program}>
            {p.title && <h2 className={styles.h2}>{p.title}</h2>}
            <RichTextView value={p.narrative} />
            {p.stats.filter((s) => s.trim()).length > 0 && (
              <>
                <h2 className={styles.h2} style={{ fontSize: "1.125rem" }}>
                  {p.statsTitle.trim() || "By the numbers"}
                </h2>
                <ul className={styles.statList}>
                  {p.stats
                    .filter((s) => s.trim())
                    .map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                </ul>
              </>
            )}
            {p.photoUrl && <Figure url={p.photoUrl} caption={p.photoCaption} className={styles.programPhoto} />}
          </div>
        ))}
      </section>
    ),

    looking_forward: (title) => (
      <section
        key="looking_forward"
        id={anchor("looking_forward")}
        className={styles.sheet}
        style={{ page: pageFor("looking_forward", title).page }}
      >
        <header className={styles.band}>
          <h1 className={styles.h1}>{title}</h1>
          {pub.lookingForward.body ? (
            <RichTextView value={pub.lookingForward.body} />
          ) : (
            placeholder("What you got wrong, what ran out, and what changes next year.")
          )}
        </header>
        {pub.lookingForward.unfunded.length > 0 && (
          <>
            <p className={styles.unfundedIntro}>
              These founders came through our pipeline this year. We did not fund them, and we supported them
              anyway.
            </p>
            {pub.lookingForward.unfunded.map((u) => (
              <div key={u.id} className={styles.unfunded}>
                <div className={styles.unfundedHead}>
                  <span className={styles.unfundedName}>{u.name}</span>
                  {u.founders.length > 0 && (
                    <span className={styles.founders} style={{ margin: 0 }}>
                      <Founders founders={u.founders} />
                    </span>
                  )}
                </div>
                <p>{u.note}</p>
              </div>
            ))}
          </>
        )}
      </section>
    ),
  };

  const rendered = pub.sections.map((s) => body[s.id](s.title));
  const yearParts = pub.label.split("–");

  return (
    <div
      className={styles.root}
      style={{ "--page-top": PAGE_TOP, "--page-side": PAGE_SIDE } as React.CSSProperties}
    >
      <section
        className={cn(styles.cover, pub.cover.imageUrl && styles.hasImage)}
        style={{ page: "ov-cover" }}
      >
        {pub.cover.imageUrl && (
          <>
            <img className={styles.coverImage} src={pub.cover.imageUrl} alt="" referrerPolicy="no-referrer" />
            <div className={styles.coverScrim} />
          </>
        )}
        <div className={styles.coverTop}>
          <span>{pub.schoolName ?? pub.orgName}</span>
          <span>{pub.inProgress ? "Year to date" : "Annual report"}</span>
        </div>
        {!pub.cover.imageUrl && (
          <div className={styles.coverYear} aria-hidden>
            {yearParts[0]}
            {yearParts[1] && <span>–{yearParts[1]}</span>}
          </div>
        )}
        <div className={styles.coverBottom}>
          <div className={styles.coverRule} />
          <div className={styles.coverOrg}>{pub.orgName}</div>
          <div className={styles.coverTitle}>{pub.cover.title}</div>
          {pub.cover.subtitle && <div className={styles.coverSubtitle}>{pub.cover.subtitle}</div>}
        </div>
      </section>

      <section className={styles.sheet} style={{ page: "ov-contents" }}>
        <h1 className={styles.h1}>Contents</h1>
        <ol className={styles.toc}>
          {pub.sections.map((s) =>
            s.id === "companies" ? (
              <li key={s.id}>
                <span className={styles.tocGroup}>Our theses on…</span>
                <ol className={styles.tocSub}>
                  {pub.companies.map((c) => (
                    <li key={c.id}>
                      <a href={`#${anchor(`company-${c.id}`)}`}>{c.name}</a>
                    </li>
                  ))}
                </ol>
              </li>
            ) : (
              <li key={s.id}>
                <a href={`#${anchor(s.id)}`}>{s.title}</a>
              </li>
            )
          )}
        </ol>
        {pub.inProgress && (
          <p className={styles.note}>
            The {pub.label} year has not ended. Every number in this report is to date.
          </p>
        )}
      </section>

      {rendered}
      {/* After the sections, so every named page has been registered. */}
      <style>{pageCss(pub, footers)}</style>
    </div>
  );
}
