export const LANGUAGES = [
  "Spanish",
  "Chinese",
  "French",
  "German",
  "Japanese",
  "Korean",
  "Portuguese",
  "Russian",
] as const;

export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGES.some((language) => language === value);
}
