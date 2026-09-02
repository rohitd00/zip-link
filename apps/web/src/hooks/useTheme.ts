import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "theme-preference";
const DARK_MODE_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Reads the theme preference saved in a previous session, defaulting to
 * "system" (never a hard-coded light default) per Section 16.5 of the
 * design specification. A value written by something other than this
 * hook (or corrupted storage) is treated the same as no preference.
 */
function readStoredPreference(): ThemePreference {
  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedValue === "light" || storedValue === "dark" || storedValue === "system") {
      return storedValue;
    }
  } catch {
    // localStorage can throw in a locked-down environment; fall back to
    // the default below rather than letting the page fail to render.
  }

  return "system";
}

function resolvePreferenceToDarkMode(preference: ThemePreference): boolean {
  if (preference === "dark") {
    return true;
  }

  if (preference === "light") {
    return false;
  }

  return window.matchMedia(DARK_MODE_MEDIA_QUERY).matches;
}

function applyDarkModeToDocument(isDarkMode: boolean): void {
  document.documentElement.classList.toggle("dark", isDarkMode);
}

/**
 * Manages the three-state Light / Dark / System theme preference described
 * in Section 16.5: persists the explicit choice to localStorage, resolves
 * "system" against the OS-level `prefers-color-scheme` media query (and
 * keeps following it live if the OS setting changes while "system" is
 * selected), and applies the resolved theme by toggling a `.dark` class on
 * `<html>` — the class Tailwind's `dark:` variant and every CSS custom
 * property in styles/global.css are keyed off. `index.html` applies this
 * same class before React ever loads, so this hook's job on mount is only
 * to read back that already-applied state, not to cause an initial flash.
 */
export function useTheme(): {
  preference: ThemePreference;
  setPreference: (nextPreference: ThemePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    applyDarkModeToDocument(resolvePreferenceToDarkMode(preference));

    if (preference !== "system") {
      return;
    }

    // While "system" is selected, keep following the OS setting live —
    // someone switching their OS to dark mode mid-session should not need
    // to reload this page to see it reflected.
    const mediaQueryList = window.matchMedia(DARK_MODE_MEDIA_QUERY);

    function handleSystemPreferenceChange(): void {
      applyDarkModeToDocument(mediaQueryList.matches);
    }

    mediaQueryList.addEventListener("change", handleSystemPreferenceChange);
    return () => mediaQueryList.removeEventListener("change", handleSystemPreferenceChange);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // A failed write just means the choice won't persist across
      // sessions; it still applies for the current one.
    }
  }, []);

  return { preference, setPreference };
}
