import { APPLICATION_PRIORITIES, type ApplicationPriority, type ApplicationStatus } from "@/db/schema";
import { seasonStartYear } from "@/lib/utils";

/**
 * Pipeline filters, parsed from the URL on the server and written back by the
 * filter bar (nuqs) on the client. One definition so the two can't drift:
 * a param the bar can set is a param the page applies.
 */
export const STATUS_FILTERS = ["all", "open", "funded", "declined"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type PipelineFilters = {
  status: StatusFilter;
  /** Season start year as a string, or "all". */
  season: string;
  /** "all" | "me" | "none" | member id */
  owner: string;
  /** "all" | sector id */
  sector: string;
  priority: "all" | ApplicationPriority;
};

export const DEFAULT_FILTERS: PipelineFilters = {
  status: "all",
  season: "all",
  owner: "all",
  sector: "all",
  priority: "all",
};

type Params = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(params: Params, key: string): string | undefined {
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

export function parsePipelineFilters(params: Params): PipelineFilters {
  const status = one(params, "status");
  const season = one(params, "season");
  const owner = one(params, "owner");
  const sector = one(params, "sector");
  const priority = one(params, "priority");
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? "")
      ? (status as StatusFilter)
      : "all",
    season: season && /^\d{4}$/.test(season) ? season : "all",
    owner: owner === "me" || owner === "none" || (owner && UUID.test(owner)) ? owner : "all",
    sector: sector && UUID.test(sector) ? sector : "all",
    priority: (APPLICATION_PRIORITIES as readonly string[]).includes(priority ?? "")
      ? (priority as ApplicationPriority)
      : "all",
  };
}

export function activeFilterCount(filters: PipelineFilters): number {
  return (Object.keys(DEFAULT_FILTERS) as (keyof PipelineFilters)[]).filter(
    (k) => filters[k] !== DEFAULT_FILTERS[k]
  ).length;
}

export type FilterableApp = {
  status: ApplicationStatus;
  appliedAt: Date | string;
  ownerId: string | null;
  sectorIds: string[];
  priority: ApplicationPriority;
};

export function applyPipelineFilters<T extends FilterableApp>(
  apps: T[],
  filters: PipelineFilters,
  viewerMemberId: string
): T[] {
  return apps.filter((a) => {
    if (filters.status !== "all" && a.status !== filters.status) return false;
    if (
      filters.season !== "all" &&
      seasonStartYear(new Date(a.appliedAt)) !== Number(filters.season)
    ) {
      return false;
    }
    if (filters.owner === "me" && a.ownerId !== viewerMemberId) return false;
    if (filters.owner === "none" && a.ownerId != null) return false;
    if (filters.owner !== "all" && filters.owner !== "me" && filters.owner !== "none" && a.ownerId !== filters.owner) {
      return false;
    }
    if (filters.sector !== "all" && !a.sectorIds.includes(filters.sector)) return false;
    if (filters.priority !== "all" && a.priority !== filters.priority) return false;
    return true;
  });
}
