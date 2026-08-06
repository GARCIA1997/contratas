import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SwRegister } from "@/components/pwa/sw-register";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { BOOT_WATCHDOG_SCRIPT } from "@/lib/boot-watchdog";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kredired",
  description: "Gestión de contratas: préstamos semanales y quincenales",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kredired",
  },
};

export const viewport: Viewport = {
  themeColor: "#021B4D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG_SCRIPT }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SwRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
