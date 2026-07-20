export type Theme = "light" | "dark";

const KEY = "kredired-theme";

export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(KEY, theme);
}

/** Script inline para el <head>: aplica el tema ANTES del primer paint (sin esto, se ve un flash del tema equivocado). */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("${KEY}");
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
`;
