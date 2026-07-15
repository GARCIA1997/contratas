export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pushEnabled, vapidPublicKey } from "@/lib/push";

export async function GET() {
  return NextResponse.json({ enabled: pushEnabled, key: vapidPublicKey() });
}
