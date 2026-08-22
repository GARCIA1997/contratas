"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Eye, Loader2, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge } from "@/components/estado-badge";
import { ScorePagoBadge } from "@/components/score-pago-badge";
import { formatMoneda } from "@/lib/utils";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { syncAll } from "@/lib/offline/sync";
import type { ClienteGlobalDetalle } from "@/lib/services/clientes-globales";
import type { TipoContrata } from "@prisma/client";

const TIPO_LABEL: Record<TipoContrata, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export default function ClienteGlobalDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const claims = useAuthClaims();

  const [cliente, setCliente] = useState<ClienteGlobalDetalle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const [errorDuplicar, setErrorDuplicar] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/clientes/buscar-global/${params.id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelado) setCliente(data);
      } catch {
        if (!cancelado) {
          setCliente(null);
          setError("No se pudo cargar este cliente.");
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [params.id]);

  async function registrarEnMiCartera() {
    const ok = confirm(
      "Se creará un registro nuevo y limpio de este cliente en tu cartera (nombre, teléfono y dirección). No copia su historial de pagos ni contratas — podrás prestarle desde cero. ¿Continuar?"
    );
    if (!ok) return;
    setDuplicando(true);
    setErrorDuplicar(null);
    try {
      const res = await fetch(`/api/clientes/buscar-global/${params.id}/duplicar`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo registrar el cliente");
      }
      const nuevo = await res.json();
      if (claims.ready && claims.ownerId) await syncAll(claims.ownerId);
      router.push(`/clientes/${nuevo.id}`);
    } catch (e) {
      setErrorDuplicar(e instanceof Error ? e.message : "No se pudo registrar el cliente");
      setDuplicando(false);
    }
  }

  if (cliente === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }

  if (cliente === null) {
    return (
      <div className="space-y-4 md:max-w-xl">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clientes/buscar-global">
            <ArrowLeft className="size-4" /> Volver
          </Link>
        </Button>
        <p className="py-10 text-center text-sm text-muted-foreground">
          {error ?? "Cliente no encontrado."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/clientes/buscar-global">
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </Button>

      <div className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/5 p-3.5">
        <Eye className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          Este cliente pertenece a la cartera de otro administrador. Solo
          puedes consultarlo — no puedes editar sus datos ni sus contratas.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{cliente.nombre}</h1>
          <ScorePagoBadge score={cliente.scorePago} />
        </div>
        {cliente.telefono && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="size-3.5" /> {cliente.telefono}
          </p>
        )}
        {cliente.direccion && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5" /> {cliente.direccion}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Prestado</p>
            <p className="text-sm font-bold">{formatMoneda(cliente.totales.capitalPrestado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Activas</p>
            <p className="text-sm font-bold">{cliente.totales.contratasActivas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">Saldo</p>
            <p className="text-sm font-bold text-primary">
              {formatMoneda(cliente.totales.saldoPendiente)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Contratas con este administrador
        </h2>
        {cliente.contratas.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No tiene contratas registradas.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {cliente.contratas.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-border/60 bg-secondary/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {TIPO_LABEL[c.tipo]}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {formatMoneda(c.monto)}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.pagados}/{c.total} cuotas pagadas
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <EstadoBadge estado={c.estado} />
                  <p className="text-sm font-semibold text-primary">
                    {formatMoneda(c.saldo)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button className="w-full" disabled={duplicando} onClick={registrarEnMiCartera}>
        <Copy className="size-4" />
        {duplicando ? "Registrando…" : "Registrar este cliente en mi cartera"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Crea un cliente nuevo y limpio (sin historial) para que puedas
        prestarle desde cero.
      </p>
      {errorDuplicar && (
        <p className="text-center text-xs text-destructive">{errorDuplicar}</p>
      )}
    </div>
  );
}
