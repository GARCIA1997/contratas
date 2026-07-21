import {
  LayoutDashboard,
  FileStack,
  Users,
  UserRound,
  Settings,
  Route,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Compartido entre BottomNav (móvil) y SidebarNav (tablet/desktop). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/ruta", label: "Ruta", icon: Route },
  { href: "/contratas", label: "Contratas", icon: FileStack },
  { href: "/clientes", label: "Clientes", icon: UserRound },
  { href: "/deudores", label: "Deudores", icon: Users },
  { href: "/config", label: "Config", icon: Settings },
];
