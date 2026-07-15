export { default } from "next-auth/middleware";

// Protege todas las rutas salvo login, auth API, assets y archivos PWA.
export const config = {
  matcher: [
    "/((?!login|registro|offline|api/auth|_next/static|_next/image|favicon.ico|manifest.json|sw.js|worker-.*|workbox-.*|icons/.*).*)",
  ],
};
