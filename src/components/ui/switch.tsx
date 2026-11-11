"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // The ::after pads the track out to a comfortable touch target on phones.
        "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs outline-none transition-colors duration-150 after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] focus-visible:ring-3 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-border-strong data-[state=unchecked]:hover:bg-fg-subtle md:after:hidden",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-150 data-[state=checked]:translate-x-[17px] data-[state=unchecked]:translate-x-px" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
