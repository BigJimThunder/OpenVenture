import { describe, expect, it } from "vitest";
import { MEMBER_ROLES, type MemberRole } from "@/db/schema";
import { describeTool, isToolName, TOOL_NAMES, toolRefusal, TOOLS, toolsFor, type ToolSpec } from "./catalog";

const spec = (name: (typeof TOOL_NAMES)[number]): ToolSpec => TOOLS[name];
const writeTools = TOOL_NAMES.filter((n) => spec(n).scope === "write");
const readTools = TOOL_NAMES.filter((n) => spec(n).scope === "read");

describe("what a token is offered", () => {
  it("gives a read token only read tools, whatever the member's role", () => {
    for (const role of MEMBER_ROLES) {
      expect(toolsFor(role, "read")).toEqual(readTools);
    }
  });

  it("gives a read-only member no write tools even with a write token", () => {
    expect(toolsFor("read_only", "write")).toEqual(readTools);
  });

  it("gives an analyst the pipeline tools but not partner or admin ones", () => {
    const tools = toolsFor("analyst", "write");
    expect(tools).toEqual(expect.arrayContaining(["add_note", "move_stage", "score_application", "email_me"]));
    expect(tools).toContain("draft_funding_request");
    for (const name of ["email_member", "draft_quarterly_letter", "draft_annual_report", "run_daily_automations"]) {
      expect(tools).not.toContain(name);
    }
  });

  it("gives a partner the report drafts and member email, but not the automations", () => {
    const tools = toolsFor("partner", "write");
    expect(tools).toEqual(expect.arrayContaining(["email_member", "draft_quarterly_letter", "draft_annual_report"]));
    expect(tools).not.toContain("run_daily_automations");
  });

  it("gives an admin with a write token everything", () => {
    expect(toolsFor("admin", "write")).toEqual(TOOL_NAMES);
  });

  it("never offers more to a lower role than to a higher one", () => {
    const ranked: MemberRole[] = ["read_only", "analyst", "partner", "admin"];
    for (let i = 1; i < ranked.length; i++) {
      const lower = toolsFor(ranked[i - 1], "write");
      expect(toolsFor(ranked[i], "write")).toEqual(expect.arrayContaining(lower));
    }
  });

  it("explains a refusal in words the model can pass on", () => {
    expect(toolRefusal("add_note", "admin", "read")).toMatch(/read-only/);
    expect(toolRefusal("run_daily_automations", "partner", "write")).toMatch(/admin role/);
    expect(toolRefusal("whoami", "read_only", "read")).toBeNull();
  });
});

describe("what the catalog must never contain", () => {
  it("has no tool that casts, opens or reveals votes, moves money, changes roles or deletes", () => {
    const forbidden = /vote|ballot|reveal|approve|issue|grant_|role|invite|offboard|delete|remove|archive|token/;
    for (const name of writeTools) expect(name).not.toMatch(forbidden);
  });

  it("can only email the member or another member, by id", () => {
    const emailTools = TOOL_NAMES.filter((n) => n.includes("email"));
    expect(emailTools).toEqual(["email_me", "email_member"]);
    for (const name of emailTools) {
      const properties = describeTool(name).inputSchema.properties as Record<string, unknown>;
      // No free-form address field anywhere: the recipient is the caller or a member id.
      expect(Object.keys(properties).filter((k) => /to|address|email|recipient/.test(k))).toEqual([]);
    }
  });
});

describe("annotations", () => {
  it("marks read tools read-only and write tools not", () => {
    for (const name of readTools) {
      expect(describeTool(name).annotations.readOnlyHint).toBe(!spec(name).sideEffects);
    }
    for (const name of writeTools) expect(describeTool(name).annotations.readOnlyHint).toBe(false);
  });

  it("flags the tools that send email as open-world and the overwriting ones as destructive", () => {
    expect(describeTool("email_member").annotations.openWorldHint).toBe(true);
    expect(describeTool("send_me_digest").annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    expect(describeTool("move_stage").annotations.destructiveHint).toBe(true);
    expect(describeTool("update_memo_section").annotations.destructiveHint).toBe(true);
    expect(describeTool("add_note").annotations.destructiveHint).toBe(false);
  });
});

describe("input schemas", () => {
  it("rejects unknown keys", () => {
    expect(TOOLS.whoami.input.safeParse({ extra: true }).success).toBe(false);
    expect(TOOLS.add_note.input.safeParse({ application: "APP-1", body: "x", pinned: true }).success).toBe(false);
  });

  it("applies defaults and does not report defaulted fields as required", () => {
    expect(TOOLS.list_applications.input.parse({})).toMatchObject({ status: "open", limit: 25 });
    expect(describeTool("list_applications").inputSchema.required ?? []).toEqual([]);
    expect(describeTool("add_note").inputSchema.required).toEqual(["application", "body"]);
  });

  it("validates dates, money and bounds", () => {
    const step = TOOLS.set_next_step.input;
    expect(step.safeParse({ application: "APP-1", next_step: "Call founder", due: "2026-11-20" }).success).toBe(true);
    expect(step.safeParse({ application: "APP-1", next_step: "Call founder", due: "next friday" }).success).toBe(false);
    expect(step.safeParse({ application: "APP-1", next_step: null }).success).toBe(true);

    const create = TOOLS.create_application.input;
    expect(create.safeParse({ company_name: "Acme", amount_requested: "1500.50" }).success).toBe(true);
    expect(create.safeParse({ company_name: "Acme", amount_requested: 1500.5 }).success).toBe(false);
    expect(create.safeParse({ company_name: "Acme", amount_requested: "1,500" }).success).toBe(false);

    const score = TOOLS.score_application.input;
    expect(score.safeParse({ application: "APP-1", scores: [{ criterion: "Team", score: 6 }] }).success).toBe(false);
    expect(score.safeParse({ application: "APP-1", scores: [] }).success).toBe(false);
  });

  it("recognizes tool names without being fooled by object internals", () => {
    expect(isToolName("whoami")).toBe(true);
    expect(isToolName("constructor")).toBe(false);
    expect(isToolName("toString")).toBe(false);
  });
});
