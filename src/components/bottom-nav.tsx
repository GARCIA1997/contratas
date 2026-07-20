"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  Users,
  UserRound,
  Settings,
  Route,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const items: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/ruta", label: "Ruta", icon: Route },
  { href: "/contratas", label: "Contratas", icon: FileStack },
  { href: "/clientes", label: "Clientes", icon: UserRound },
  { href: "/deudores", label: "Deudores", icon: Users },
  { href: "/config", label: "Config", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
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
