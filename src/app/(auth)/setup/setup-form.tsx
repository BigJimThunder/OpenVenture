"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bootstrapOrg } from "@/lib/actions/setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function SetupForm({ defaultFiscalYear }: { defaultFiscalYear: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await bootstrapOrg({
      clubName: String(fd.get("clubName") ?? ""),
      schoolName: String(fd.get("schoolName") ?? "") || undefined,
      emailDomain: String(fd.get("emailDomain") ?? "") || undefined,
      poolBudget: Number(fd.get("poolBudget") ?? 10000),
      fiscalYear: Number(fd.get("fiscalYear") ?? defaultFiscalYear),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Welcome to OpenVenture");
    router.push("/");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clubName">Club name</Label>
            <Input id="clubName" name="clubName" required placeholder="Cardinal Ventures" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schoolName">School</Label>
            <Input id="schoolName" name="schoolName" placeholder="Example University" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emailDomain">Restrict sign-in to email domain (optional)</Label>
            <Input id="emailDomain" name="emailDomain" placeholder="university.edu" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="poolBudget">Annual grant budget ($)</Label>
              <Input
                id="poolBudget"
                name="poolBudget"
                type="number"
                min={0}
                step={100}
                defaultValue={10000}
                className="tnum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fiscalYear">Fiscal year</Label>
              <Input
                id="fiscalYear"
                name="fiscalYear"
                type="number"
                defaultValue={defaultFiscalYear}
                className="tnum"
              />
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Setting up…" : "Create club"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
