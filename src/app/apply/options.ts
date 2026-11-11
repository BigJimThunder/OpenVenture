/**
 * Choices offered on the public form. Stored values match what the insights
 * aggregates already bucket on, so hosted-form and webhook answers add up.
 */

export const TEAM_MIX_OPTIONS = [
  { value: "all_students", label: "Everyone is a current student" },
  { value: "mixed", label: "A mix of students and others" },
  { value: "non_students", label: "No current students" },
] as const;

export const GENDER_OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" },
  { value: "self_described", label: "Another identity" },
] as const;

export const RACE_OPTIONS = [
  { value: "asian", label: "Asian" },
  { value: "black", label: "Black or African American" },
  { value: "hispanic_latino", label: "Hispanic or Latino" },
  { value: "middle_eastern_north_african", label: "Middle Eastern or North African" },
  { value: "native_american", label: "Native American or Alaska Native" },
  { value: "pacific_islander", label: "Native Hawaiian or Pacific Islander" },
  { value: "white", label: "White" },
  { value: "two_or_more", label: "Two or more" },
  { value: "another", label: "Another race or ethnicity" },
] as const;

export const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
