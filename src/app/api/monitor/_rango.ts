import type { NextRequest } from "next/server";
import { desdeDe, type Rango } from "@/lib/monitor/datos";

export function rangoDe(req: NextRequest): Rango {
  const r = req.nextUrl.searchParams.get("rango");
  return r === "7d" || r === "30d" ? r : "hoy";
}

export function desdeDeReq(req: NextRequest): Date {
  return desdeDe(rangoDe(req));
}
