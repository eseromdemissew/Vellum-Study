import { en } from "./en";
import { am } from "./am";
import { om } from "./om";
import { ti } from "./ti";
import type { LanguageCode } from "@/lib/i18n";

export { en, am, om, ti };

export const dictionaries: Record<LanguageCode, Record<string, string>> = {
  en,
  am,
  om,
  ti,
};
