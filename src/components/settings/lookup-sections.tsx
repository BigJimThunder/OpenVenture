"use client";

import {
  createScreeningCriterion,
  updateScreeningCriterion,
  archiveScreeningCriterion,
  createSector,
  updateSector,
  archiveSector,
  createDealSource,
  updateDealSource,
  archiveDealSource,
} from "@/lib/actions/lookups";
import { LookupManager, type LookupItem } from "./lookup-manager";

export function CriteriaManager({ items }: { items: LookupItem[] }) {
  return (
    <LookupManager
      items={items}
      addPlaceholder="e.g. Team strength"
      onCreate={(label) => createScreeningCriterion({ label })}
      onRename={(id, label) => updateScreeningCriterion({ id, label })}
      onArchive={(id) => archiveScreeningCriterion({ id })}
    />
  );
}

export function SectorManager({ items }: { items: LookupItem[] }) {
  return (
    <LookupManager
      items={items}
      addPlaceholder="e.g. Climate"
      onCreate={(name) => createSector({ name })}
      onRename={(id, name) => updateSector({ id, name })}
      onArchive={(id) => archiveSector({ id })}
    />
  );
}

export function DealSourceManager({ items }: { items: LookupItem[] }) {
  return (
    <LookupManager
      items={items}
      addPlaceholder="e.g. Demo Day"
      onCreate={(name) => createDealSource({ name })}
      onRename={(id, name) => updateDealSource({ id, name })}
      onArchive={(id) => archiveDealSource({ id })}
    />
  );
}
