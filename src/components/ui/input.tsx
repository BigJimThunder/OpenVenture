import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The look every text control shares (Input, Textarea, SelectTrigger,
 * NativeSelect, InputGroup): a visible resting border, a darker one on hover,
 * the accent with a soft ring on focus, danger when `aria-invalid`, and a
 * flat gray fill when disabled or read-only.
 */
export const fieldChrome =
  "w-full min-w-0 rounded-md border border-border-strong bg-panel text-sm text-fg shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-100 placeholder:text-fg-muted/85 hover:border-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-subtle disabled:text-fg-muted disabled:shadow-none disabled:hover:border-border";

/** 36px with a mouse, 44px under a thumb. */
export const fieldHeight = "h-9 max-md:h-11";

type InputProps = React.ComponentProps<"input"> & {
  /** Fixed adornment before the value: `$`, an icon. Renders the input inside an `InputGroup`. */
  leading?: React.ReactNode;
  /** Fixed adornment after the value: `%`, a unit. */
  trailing?: React.ReactNode;
};

function Input({ className, type, leading, trailing, ...props }: InputProps) {
  if (leading != null || trailing != null) {
    // The group owns the chrome and takes `className` (widths, heights); the
    // input keeps the id and aria wiring so labels and `Field` still reach it.
    return (
      <InputGroup prefix={leading} suffix={trailing} className={className}>
        <input type={type} className="w-full min-w-0 outline-none placeholder:text-fg-muted/85 disabled:cursor-not-allowed" {...props} />
      </InputGroup>
    );
  }
  return (
    <input
      type={type}
      className={cn(
        fieldChrome,
        fieldHeight,
        "flex px-3 py-1 read-only:bg-bg-subtle/60 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        type === "number" && "tnum",
        className
      )}
      {...props}
    />
  );
}

/**
 * An input with a fixed adornment on either side — `$` before an amount, `%`
 * after a rate, a unit, an icon. The group draws the border and focus ring;
 * the `Input` inside goes bare.
 *
 * Usually reached through `<Input leading="$" />`; use the group directly to
 * wrap something other than a plain input.
 */
function InputGroup({
  prefix,
  suffix,
  className,
  children,
}: {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        fieldChrome,
        fieldHeight,
        "tnum flex items-center gap-1.5 px-3",
        "has-[input:focus-visible]:border-accent has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-accent/20",
        "has-[input[aria-invalid=true]]:border-danger has-[input[aria-invalid=true]:focus-visible]:ring-danger/20",
        "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-border has-[input:disabled]:bg-bg-subtle has-[input:disabled]:shadow-none",
        "[&_input]:h-full [&_input]:flex-1 [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:shadow-none [&_input]:ring-0 [&_input]:focus-visible:ring-0",
        className
      )}
    >
      {prefix != null && <span className="shrink-0 text-fg-muted select-none [&_svg]:size-4">{prefix}</span>}
      {children}
      {suffix != null && <span className="shrink-0 text-fg-muted select-none [&_svg]:size-4">{suffix}</span>}
    </div>
  );
}

export { Input, InputGroup };
