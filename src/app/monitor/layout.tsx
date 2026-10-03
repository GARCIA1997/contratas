import type { Metadata } from "next";
import "./monitor.css";

export const metadata: Metadata = {
  title: "Kredired Monitor",
  robots: { index: false, follow: false },
};

/**
 * Raíz del monitor de operaciones. Vive dentro del mismo proyecto que la app
 * pero es otra cosa: web de escritorio, sin PWA ni modo offline (el service
 * worker no lo cachea, ver src/sw.ts), con su propio diseño (Stitch).
 */
export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="monitor" className="dark min-h-screen bg-surface font-body-md text-body-md text-on-surface antialiased">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
      />
      {children}
    </div>
  );
}
