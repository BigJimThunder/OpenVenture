/**
 * First stop for keyboard and screen-reader users: jumps past the navigation
 * to the page's content. Parked just above the viewport until it takes focus,
 * then slides into the corner at full size. `href` is the id of the element
 * to land on (the `<main>`, which should carry `tabIndex={-1}` so focus
 * really moves there).
 */
export function SkipLink({ href = "#main" }: { href?: `#${string}` }) {
  return (
    <a
      href={href}
      className="fixed top-3 left-3 z-[60] inline-flex h-10 -translate-y-[200%] items-center rounded-md bg-panel-raised px-3.5 text-sm font-medium text-fg shadow-lg ring-2 ring-accent outline-none transition-transform focus:translate-y-0 motion-reduce:transition-none print:hidden"
    >
      Skip to content
    </a>
  );
}
