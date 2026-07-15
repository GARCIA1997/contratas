import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listUsuarios } from "@/lib/services/usuarios";
import { Button } from "@/components/ui/button";
import { UsuariosPanel } from "@/components/config/usuarios-panel";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect("/config");

  const usuarios = await listUsuarios(user.ownerId);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/config">
          <ArrowLeft className="size-4" /> Configuración
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
      <UsuariosPanel
        usuarios={usuarios}
        actorId={user.id}
        spaceOwnerId={user.ownerId}
      />
    </div>
  );
}
