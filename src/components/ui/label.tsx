"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "text-sm leading-4 font-medium text-fg select-none peer-disabled:cursor-not-allowed peer-disabled:text-fg-muted",
        className
      )}
      {...props}
    />
  );
}

export { Label };
