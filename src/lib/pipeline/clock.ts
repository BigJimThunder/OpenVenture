/**
 * The request's "now", read once in a server component and passed down as a
 * prop. Client components that format relative time from it render the same
 * text on the server and at hydration — calling Date.now() in each would not.
 */
export function requestNow(): number {
  return Date.now();
}
