"use client";

import { modoLocalActivo } from "@/lib/offline/modo-local";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Usuario = {
  id: string;
  nombre: string | null;
  email: string;
  rol: "ADMIN" | "VIEWER";
};

export function UsuariosPanel({
  usuarios,
  actorId,
  spaceOwnerId,
}: {
  usuarios: Usuario[];
  actorId: string;
  /** Dueño del espacio: su fila no se puede eliminar ni degradar de rol. */
  spaceOwnerId: string;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<"ADMIN" | "VIEWER">("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (modoLocalActivo()) return setError("Enciende la sincronización para hacer este cambio.");
    setGuardando(true);
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nombre.trim() || null,
        email: email.trim(),
        password,
        rol,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear el usuario");
      return;
    }
    setNombre("");
    setEmail("");
    setPassword("");
    setRol("VIEWER");
    router.refresh();
  }

  async function cambiarRol(id: string, nuevoRol: "ADMIN" | "VIEWER") {
    if (modoLocalActivo()) return alert("Enciende la sincronización para hacer este cambio.");
    const res = await fetch(`/api/usuarios/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol: nuevoRol }),
    });
    if (res.ok) router.refresh();
    else alert("No se pudo cambiar el rol.");
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este usuario? Se borran también sus datos.")) return;
    if (modoLocalActivo()) return alert("Enciende la sincronización para hacer este cambio.");
    const res = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "No se pudo eliminar.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-1 text-sm font-medium">
            <UserPlus className="size-4" /> Nuevo usuario
          </p>
          <form onSubmit={crear} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rol">Rol</Label>
                <Select
                  id="rol"
                  value={rol}
                  onChange={(e) => setRol(e.target.value as "ADMIN" | "VIEWER")}
                  className="h-10 truncate bg-background pr-8"
                >
                  <option value="VIEWER">VIEWER</option>
                  <option value="ADMIN">ADMIN</option>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {rol === "ADMIN" ? "Lectura y escritura" : "Solo lectura"}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña (mín. 6)</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={guardando}>
              {guardando ? "Creando…" : "Crear usuario"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ul className="space-y-2">
        {usuarios.map((u) => (
          <li key={u.id}>
            <Card className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.nombre || u.email}
                  {u.id === actorId && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (tú)
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {u.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {u.id === spaceOwnerId ? (
                  <Badge variant="secondary">Dueño</Badge>
                ) : (
                  <Select
                    value={u.rol}
                    onChange={(e) =>
                      cambiarRol(u.id, e.target.value as "ADMIN" | "VIEWER")
                    }
                    className="h-8 w-auto rounded-md bg-background px-1.5 pr-6 text-xs"
                    aria-label="Rol"
                  >
                    <option value="VIEWER">VIEWER</option>
                    <option value="ADMIN">ADMIN</option>
                  </Select>
                )}
                {u.id !== actorId && u.id !== spaceOwnerId ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="size-8"
                    onClick={() => eliminar(u.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : u.id === actorId ? (
                  <Badge variant="secondary">activo</Badge>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
