// English / Arabic. English text is the key: t("Start") looks up the Arabic
// dictionary when Arabic is on and falls back to the English otherwise, so a
// missing translation never breaks a screen. `{name}` placeholders are filled
// from `vars`.

import { create } from "zustand";
import { AR } from "./ar";

export type Lang = "en" | "ar";
const LANG_KEY = "arena-os-lang-v1";

export const useLang = create<{ lang: Lang }>(() => ({ lang: "en" }));

let current: Lang = "en";

// Money Mondo uses the same screens as Arena with its own position names.
type Vocabulary = "arena" | "mm";
let vocabulary: Vocabulary = "arena";
const MM_WORDS: Record<Lang, [string, string][]> = {
  en: [
    ["Operations Manager", "Mall Manager"],
    ["Department Manager", "OMT Manager"],
    ["Department manager", "OMT Manager"],
    ["daily venue report", "daily Money Mondo report"],
    ["Daily venue report", "Daily Money Mondo report"],
  ],
  ar: [
    ["مدير العمليات", "مدير المول"],
    ["مدير القسم", "مدير OMT"],
    ["تقرير المكان اليومي", "تقرير Money Mondo اليومي"],
  ],
};

/** Called by the store when the business on screen changes. */
export function setVocabulary(v: Vocabulary) {
  vocabulary = v;
}

function words(text: string): string {
  if (vocabulary === "arena") return text;
  let out = text;
  for (const [a, b] of MM_WORDS[current]) if (out.includes(a)) out = out.split(a).join(b);
  return out;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function t(en: string, vars?: Record<string, string | number>): string {
  if (current === "ar") {
    const ar = AR[en];
    if (ar !== undefined) return words(fill(ar, vars));
    // Several job titles joined, e.g. "OMT Operator · Group Agent".
    if (en.includes(" · ")) return words(fill(en.split(" · ").map((part) => AR[part] ?? part).join(" · "), vars));
  }
  return words(fill(en, vars));
}

export const isAr = () => current === "ar";

function applyDocument(lang: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage blocked
  }
  applyDocument(lang);
  useLang.setState({ lang });
}

/** Restore the saved language before the first paint of the app. */
export function initLang() {
  let lang: Lang = "en";
  try {
    if (localStorage.getItem(LANG_KEY) === "ar") lang = "ar";
  } catch {
    // storage blocked
  }
  current = lang;
  applyDocument(lang);
  useLang.setState({ lang });
}

/** Locale for dates and numbers: Arabic month and day names, Western digits. */
export const locale = () => (current === "ar" ? "ar-LB-u-nu-latn" : "en-GB");
