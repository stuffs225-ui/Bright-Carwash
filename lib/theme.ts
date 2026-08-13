export type ThemeChoice = "auto" | "light" | "dark";
export type AppMode = "worker" | "owner";

const THEME_KEY = "carwash_theme_v1";
const MODE_KEY = "carwash_mode_v1";

export function getTheme(): ThemeChoice {
  if (typeof window === "undefined") return "auto";
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

// "auto" يعني لا نبصم data-theme إطلاقاً، فيتولى prefers-color-scheme الأمر
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function setTheme(choice: ThemeChoice) {
  localStorage.setItem(THEME_KEY, choice);
  applyTheme(choice);
  window.dispatchEvent(new Event("app-prefs-changed"));
}

export function getMode(): AppMode {
  if (typeof window === "undefined") return "worker";
  return localStorage.getItem(MODE_KEY) === "owner" ? "owner" : "worker";
}

// وضع الموظف يكبّر عناصر اللمس تلقائياً (تابلت بيد مبلولة، ذروة ليلية)
export function applyMode(mode: AppMode) {
  document.documentElement.classList.toggle("touch-mode", mode === "worker");
}

export function setMode(mode: AppMode) {
  localStorage.setItem(MODE_KEY, mode);
  applyMode(mode);
  window.dispatchEvent(new Event("app-prefs-changed"));
}
