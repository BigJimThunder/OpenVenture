import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] cursor-pointer select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-bg [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent-hover shadow-xs",
        secondary: "bg-panel border border-border text-fg hover:bg-bg-subtle hover:border-border-strong shadow-xs",
        ghost: "text-fg-muted hover:bg-bg-subtle hover:text-fg",
        danger: "bg-danger text-white hover:opacity-90 shadow-xs",
        "danger-ghost": "text-danger hover:bg-danger-bg",
        link: "text-accent underline-offset-4 hover:underline",
      },
      // The compact sizes are 28px for mouse density. Under a finger they grow
      // to 36px — as a minimum, so a call site's own phone height still wins.
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 rounded-md px-2.5 text-xs pointer-coarse:min-h-9",
        lg: "h-10 rounded-lg px-4 text-base",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7 pointer-coarse:min-h-9 pointer-coarse:min-w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
