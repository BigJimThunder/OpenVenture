/**
 * Pure and client-safe: imported by the annual report editor in the browser.
 * Keep this file free of server imports.
 */

/** Shown beside the essay when AI is off — the same questions the model is told to leave open. */
export function essayQuestions(founder: string, company: string): string[] {
  return [
    `How did you first meet ${founder}, and what did you notice?`,
    `What had they already built or tested before they asked us for money?`,
    `What did ${founder} say or do in the coffee chat that changed your mind, or confirmed it?`,
    `Why ${founder}, and not someone else, for ${company}?`,
    `What do you expect to be true about ${company} a year from now?`,
  ];
}
