import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

const KEY = "wild_life_theme"

/** The theme applied to <html> right now (set pre-paint by the inline script). */
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // ignore — private mode / disabled storage
  }
}

/** Read + toggle the light/dark theme, persisting the choice. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    apply(theme)
  }, [theme])

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  }
}
