export function formatDuration(durationMinutes) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `${hours}\u00a0h\u00a0${minutes}\u00a0min`;
}

export function formatUsd(amount) {
  return `$${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function countryFlag(countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!/^[A-Z]{2}$/u.test(code)) return "";
  return [...code].map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("");
}

export function countryFlagPath(countryCode) {
  const code = String(countryCode || "").toLowerCase();
  return /^[a-z]{2}$/u.test(code) ? `/flags/${code}.svg` : "";
}

export function countryName(countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!/^[A-Z]{2}$/u.test(code)) return "";
  if (code === "CS" || code === "XC") return "Československo";
  try {
    return new Intl.DisplayNames(["sk"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

const LANGUAGE_CODE_ALIASES = {
  ara: "ar", ces: "cs", chi: "zh", cze: "cs", deu: "de", dut: "nl", eng: "en",
  fin: "fi", fra: "fr", fre: "fr", ger: "de", gre: "el", hun: "hu", ita: "it",
  jpn: "ja", kor: "ko", nld: "nl", nor: "no", pol: "pl", por: "pt", ron: "ro",
  rum: "ro", rus: "ru", slk: "sk", slo: "sk", spa: "es", swe: "sv", ukr: "uk",
  zho: "zh",
};

const LANGUAGE_REGION_CANDIDATES = {
  ar: ["MA", "EG", "SA"], cs: ["CZ"], da: ["DK"], de: ["DE", "AT", "CH"],
  el: ["GR"], en: ["GB", "US", "IE", "CA", "AU", "NZ"], es: ["ES", "MX", "AR"],
  fi: ["FI"], fr: ["FR", "BE", "CA", "CH"], he: ["IL"], hi: ["IN"], hu: ["HU"],
  it: ["IT"], ja: ["JP"], ko: ["KR"], nl: ["NL", "BE"], no: ["NO"], pl: ["PL"],
  pt: ["PT", "BR"], ro: ["RO"], ru: ["RU"], sk: ["SK"], sv: ["SE"], tr: ["TR"],
  uk: ["UA"], zh: ["CN", "TW", "HK"],
};

export function normalizeLanguageCode(languageCode) {
  const code = String(languageCode || "").trim().toLowerCase();
  if (/^[a-z]{2}$/u.test(code)) return code;
  return LANGUAGE_CODE_ALIASES[code] || "";
}

export function languageName(languageCode) {
  const code = normalizeLanguageCode(languageCode);
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["sk"], { type: "language" }).of(code) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function languageFlagCountry(languageCode, productionCountries = []) {
  const candidates = LANGUAGE_REGION_CANDIDATES[normalizeLanguageCode(languageCode)] || [];
  const countries = new Set(productionCountries.map((code) => String(code).toUpperCase()));
  return candidates.find((code) => countries.has(code)) || candidates[0] || "";
}
