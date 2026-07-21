"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoneda } from "@/lib/utils";
import { enqueue } from "@/lib/offline/queue";
import { syncDeudores } from "@/lib/offline/sync";

type AbonoUI = {
  id: string;
  fecha: string;
  monto: number;
  restante: number;
  notas: string | null;
};

type DeudorUI = {
  id: string;
  nombre: string;
  deudaInicial: number;
  notas: string | null;
  saldoActual: number;
  abonos: AbonoUI[];
};

function fecha(iso: string) {
  return format(new Date(iso), "d MMM yyyy", { locale: es });
}

export function DeudorDetalle({
  deudor,
  esAdmin,
  ownerId,
}: {
  deudor: DeudorUI;
  esAdmin: boolean;
  /** Presente cuando la página vive en la capa offline (ver repo/useLiveQuery). */
  ownerId?: string | null;
}) {
  const router = useRouter();
  const abonos = deudor.abonos;
  const saldo = deudor.saldoActual;

  const [monto, setMonto] = useState("");
  const [fechaAbono, setFechaAbono] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function agregarAbono(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) return setError("Monto inválido");

    setGuardando(true);
    try {
      if (ownerId) {
        await enqueue(ownerId, "deudor.abonar", {
          deudorId: deudor.id,
          abonoLocalId: crypto.randomUUID(),
          fecha: fechaAbono,
          monto: montoNum,
          notas: notas.trim() || null,
        });
      } else {
        const res = await fetch(`/api/deudores/${deudor.id}/abonos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha: fechaAbono,
            monto: montoNum,
            notas: notas.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo registrar el abono");
        }
        router.refresh();
      }
      setMonto("");
      setNotas("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el abono");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!confirm("¿Eliminar este deudor y su historial?")) return;
    const res = await fetch(`/api/deudores/${deudor.id}`, { method: "DELETE" });
    if (res.ok) {
      // Igual que en cobro-vencido: el DELETE ya pasó en el servidor, pero
      // Dexie sigue teniendo el registro hasta el próximo sync — sin esto
      // la lista de deudores lo seguía mostrando hasta un refresh manual.
      if (ownerId) await syncDeudores(ownerId);
      router.push("/deudores");
      router.refresh();
    } else {
      alert("No se pudo eliminar.");
    }
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/deudores">
            <ArrowLeft className="size-4" /> Volver
          </Link>
        </Button>
        {esAdmin && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/deudores/${deudor.id}/editar`}>
                <Pencil className="size-4" /> Editar
              </Link>
            </Button>
            <Button variant="destructive" size="sm" onClick={eliminar}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{deudor.nombre}</h1>
        {deudor.notas && (
          <p className="text-sm text-muted-foreground">{deudor.notas}</p>
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Deuda inicial</p>
            <p className="font-semibold">{formatMoneda(deudor.deudaInicial)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Abonado</p>
            <p className="font-semibold">
              {formatMoneda(deudor.deudaInicial - saldo)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className="font-semibold text-vencido">{formatMoneda(saldo)}</p>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" variant="outline" asChild>
        <Link href={`/deudores/${deudor.id}/estado-cuenta`}>
          <FileText className="size-4" /> Estado de cuenta
        </Link>
      </Button>

      {esAdmin && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 flex items-center gap-1 text-sm font-medium">
              <Plus className="size-4" /> Registrar abono
            </p>
            <form onSubmit={agregarAbono} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fecha">Fecha</Label>
                  <Input
                    id="fecha"
                    type="date"
                    value={fechaAbono}
                    onChange={(e) => setFechaAbono(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="monto">Monto</Label>
                  <Input
                    id="monto"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas (opcional)"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={guardando}>
                {guardando ? "Guardando…" : "Agregar abono"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Abono</th>
              <th className="px-3 py-2 text-right font-medium">Restante</th>
            </tr>
          </thead>
          <tbody>
            {abonos.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Sin abonos todavía.
                </td>
              </tr>
            )}
            {abonos.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2.5">{fecha(a.fecha)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-pagado">
                  {formatMoneda(a.monto)}
                </td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">
                  {formatMoneda(a.restante)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
