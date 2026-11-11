import type { DocVisibility } from "@/db/schema";

export const VISIBILITY_LABEL: Record<DocVisibility, string> = {
  all: "Everyone in the club",
  partners: "Partners and admins",
  admins: "Admins only",
};

export const VISIBILITY_BADGE: Record<DocVisibility, string | null> = {
  all: null,
  partners: "Partners only",
  admins: "Admins only",
};
