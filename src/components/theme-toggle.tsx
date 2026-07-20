"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  if (theme === null) {
    // Evita el mismatch de hidratación: hasta montar no sabemos qué aplicó
    // el script anti-flash en el <head>.
    return <div className="h-10 w-full" />;
  }

  function alternar() {
    // Lee el tema actual del DOM (no del estado de React) para no depender
    // de que haya terminado de re-renderizar entre un click y el siguiente.
    const siguiente: Theme = getTheme() === "dark" ? "light" : "dark";
    setTheme(siguiente);
    setThemeState(siguiente);
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-between"
      onClick={alternar}
    >
      <span className="flex items-center gap-2">
        {theme === "dark" ? (
          <Moon className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
        Modo oscuro
      </span>
      <span
        className={
          theme === "dark"
            ? "relative h-5 w-9 rounded-full bg-primary transition-colors"
            : "relative h-5 w-9 rounded-full bg-muted transition-colors"
        }
      >
        <span
          className={
            theme === "dark"
              ? "absolute left-[18px] top-0.5 size-4 rounded-full bg-white transition-all"
              : "absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-all"
          }
        />
      </span>
    </Button>
  );
}
