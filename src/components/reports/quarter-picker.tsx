"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function QuarterPicker({ fiscalYear, quarter }: { fiscalYear: number; quarter: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const years = [fiscalYear + 1, fiscalYear, fiscalYear - 1, fiscalYear - 2];

  return (
    <div className="flex items-center gap-1.5">
      <Select value={String(fiscalYear)} onValueChange={(v) => router.push(`${pathname}?fy=${v}&q=${quarter}`)}>
        <SelectTrigger className="w-28" aria-label="Fiscal year">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              FY{y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(quarter)} onValueChange={(v) => router.push(`${pathname}?fy=${fiscalYear}&q=${v}`)}>
        <SelectTrigger className="w-20" aria-label="Quarter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4].map((q) => (
            <SelectItem key={q} value={String(q)}>
              Q{q}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
