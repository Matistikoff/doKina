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
