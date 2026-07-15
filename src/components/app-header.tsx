"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { data: session } = useSession();
  const rol = session?.user?.rol;

  return (
    <header className="sticky top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="glass glass-nav mx-auto flex h-14 max-w-lg items-center justify-between gap-2 rounded-[1.5rem] px-3 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.15)] sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/kredired.png"
            alt=""
            className="size-8 shrink-0 rounded-[0.6rem] object-cover"
          />
          <span className="truncate text-base font-bold tracking-tight text-primary sm:text-lg">
            Kredired
          </span>
          {rol && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {rol}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Cerrar sesión"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="shrink-0"
        >
          <LogOut className="size-5" />
        </Button>
      </div>
    </header>
  );
}
