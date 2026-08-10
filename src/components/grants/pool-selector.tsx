"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PoolSelector({
  pools,
  currentPoolId,
}: {
  pools: { id: string; name: string }[];
  currentPoolId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (pools.length < 2) return null;
  return (
    <Select
      value={currentPoolId}
      onValueChange={(v) => router.push(`${pathname}?pool=${v}`)}
    >
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {pools.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
