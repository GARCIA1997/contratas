"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/nav-items";

/**
 * Reemplaza a BottomNav a partir de tablet (md:) — mismo set de rutas,
 * layout de sidebar fijo en vez de barra inferior. Solo se renderiza (vía
 * `hidden md:flex`) en esos tamaños; en móvil sigue siendo BottomNav.
 */
export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    for (const { href } of NAV_ITEMS) {
      if (href !== pathname) router.prefetch(href);
    }
  }, [router, pathname]);

  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r px-3 py-6 md:flex">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={active ? 2.3 : 2} />
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
