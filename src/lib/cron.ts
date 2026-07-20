import type { NextRequest } from "next/server";

/** Autoriza al crontab del VPS: `Authorization: Bearer <CRON_SECRET>` o `x-cron-secret: <CRON_SECRET>`. */
export function esCronAutorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const header = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || header === secret;
}
