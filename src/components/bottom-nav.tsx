"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS as items } from "@/components/nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // El prefetch automático de <Link> (en viewport) no siempre alcanza a
  // poblar la caché del service worker a tiempo — al ser la navegación
  // principal de la app, forzarlo aquí garantiza que las 5 pestañas
  // funcionen sin conexión desde el primer momento, no solo tras visitarlas.
  useEffect(() => {
    for (const { href } of items) {
      if (href !== pathname) router.prefetch(href);
    }
  }, [router, pathname]);

  return (
    // md:hidden: a partir de tablet la navegación vive en SidebarNav — el
    // celular (sin prefijo) no cambia en absoluto.
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
      <ul className="glass glass-nav mx-auto flex max-w-lg items-stretch justify-around rounded-[1.75rem] px-1 py-1.5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.25)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-medium leading-none tracking-tight transition-all duration-300",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute inset-x-0.5 inset-y-0.5 -z-10 rounded-2xl bg-primary/12 ring-1 ring-primary/15" />
                )}
                <Icon className="size-5" strokeWidth={active ? 2.3 : 2} />
                <span className="max-w-full truncate px-0.5">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
