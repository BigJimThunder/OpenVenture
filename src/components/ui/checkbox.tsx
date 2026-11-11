"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        // The ::after pads the 16px box out to a 40px touch target on phones.
        "peer relative size-4 shrink-0 cursor-pointer rounded-[5px] border border-border-strong bg-panel shadow-xs outline-none transition-[border-color,background-color,box-shadow] duration-100 after:absolute after:-inset-3 after:content-[''] hover:border-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/25 aria-invalid:border-danger disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-subtle disabled:shadow-none data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-accent-fg disabled:data-[state=checked]:border-border-strong disabled:data-[state=checked]:bg-border-strong max-md:size-5 md:after:hidden",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group flex items-center justify-center text-current">
        <CheckIcon strokeWidth={3} className="size-3 group-data-[state=indeterminate]:hidden max-md:size-3.5" />
        <MinusIcon strokeWidth={3} className="hidden size-3 group-data-[state=indeterminate]:block max-md:size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
