"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.dataset.theme === "dark");
    const system = matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      try {
        if (localStorage.getItem("sahaay-theme")) return;
      } catch {}
      document.documentElement.dataset.theme = system.matches
        ? "dark"
        : "light";
      sync();
    };
    const storage = () => {
      let preference: string | null = null;
      try {
        preference = localStorage.getItem("sahaay-theme");
      } catch {}
      document.documentElement.dataset.theme =
        preference === "dark" || (preference !== "light" && system.matches)
          ? "dark"
          : "light";
      sync();
    };
    sync();
    system.addEventListener("change", followSystem);
    window.addEventListener("storage", storage);
    return () => {
      system.removeEventListener("change", followSystem);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return (
    <>
      <button
        className="theme-toggle"
        title={`Switch to ${dark ? "light" : "dark"} mode`}
        aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
        onClick={() => {
          const next = !dark;
          document.documentElement.dataset.theme = next ? "dark" : "light";
          try {
            localStorage.setItem("sahaay-theme", next ? "dark" : "light");
          } catch {}
          setDark(next);
        }}
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </>
  );
}
