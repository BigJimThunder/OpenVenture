"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { SearchIcon, SunIcon, MoonIcon, LogOutIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandPalette } from "./command-palette";

export function Topbar({ memberName, role }: { memberName: string; role: string }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-border bg-bg px-4">
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex h-7 w-64 cursor-pointer items-center gap-2 rounded-md border border-border bg-panel px-2.5 text-xs text-fg-subtle shadow-sm transition-colors hover:border-border-strong"
      >
        <SearchIcon className="size-3.5" />
        <span>Search or jump to…</span>
        <kbd className="ml-auto rounded border border-border bg-bg-subtle px-1 text-2xs">⌘K</kbd>
      </button>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          <SunIcon className="size-4 dark:hidden" />
          <MoonIcon className="hidden size-4 dark:block" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <Avatar>
              <AvatarFallback>{initials(memberName)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="normal-case tracking-normal">
              <div className="text-sm font-medium text-fg">{memberName}</div>
              <div className="text-2xs capitalize text-fg-subtle">{role.replace("_", " ")}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
