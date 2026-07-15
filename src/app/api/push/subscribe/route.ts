import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { endpoint, keys } = schema.parse(await req.json());

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { ownerId: user.ownerId, p256dh: keys.p256dh, auth: keys.auth },
      create: {
        ownerId: user.ownerId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUser();
    const { endpoint } = z
      .object({ endpoint: z.string().url() })
      .parse(await req.json());
    await prisma.pushSubscription
      .delete({ where: { endpoint } })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
