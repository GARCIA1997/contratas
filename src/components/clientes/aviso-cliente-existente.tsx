"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Phone, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { flushQueue } from "@/lib/offline/queue";
import { syncClientes } from "@/lib/offline/sync";
import { rutas } from "@/lib/rutas";
import { formatMoneda } from "@/lib/utils";
import type { Verificacion } from "@/lib/offline/verificar-cliente";

/**
 * Aviso antes de registrar un cliente que ya existe (ver
 * verificar-cliente.ts):
 * - nombre y teléfono iguales, tuyo → "ya te pertenece", ir a su perfil
 *   (subiendo antes lo que esté en cola, o bajándolo si solo lo tiene el
 *   servidor);
 * - nombre y teléfono iguales, de otro administrador → con quién tiene
 *   contratas, ¿le entregas tú? Sí / No;
 * - solo el teléfono coincide → ese número es de otra persona,
 *   ¿registrar de todos modos? Sí / No.
 */
export function AvisoClienteExistente({
  ownerId,
  verificacion,
  onUsarExistente,
  onRegistrarDeTodos,
  onCancelar,
}: {
  ownerId: string;
  verificacion: Exclude<Verificacion, { tipo: "nuevo" }>;
  /** Para el alta desde una contrata: en vez de ir al perfil, elegirlo. */
  onUsarExistente?: (cliente: { id: string; nombre: string }) => void;
  onRegistrarDeTodos: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  // En el celular el aviso sale debajo de los campos: se lleva a la vista
  // para que no pase desapercibido.
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caja.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [verificacion]);

  if (verificacion.tipo === "propio") {
    const { cliente, enCola, soloEnServidor } = verificacion;

    const irAlPerfil = async () => {
      setAbriendo(true);
      try {
        // En cola: se intenta subir ya (sin señal no hace nada y sigue en
        // el teléfono). Solo en servidor: se baja para que el perfil abra.
        if (enCola) await flushQueue(ownerId);
        if (soloEnServidor) await syncClientes(ownerId);
      } catch {
        // El perfil abre igual con lo que haya en el teléfono.
      }
      if (onUsarExistente) {
        onUsarExistente(cliente);
        setAbriendo(false);
        return;
      }
      router.push(rutas.cliente(cliente.id));
    };

    return (
      <Card ref={caja} className="border-primary/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <UserCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Este cliente ya te pertenece</p>
              <p>
                <span className="font-medium">{cliente.nombre}</span>
                {cliente.telefono ? ` · ${cliente.telefono}` : ""}
              </p>
              {enCola && (
                <p className="text-muted-foreground">
                  Está guardado en tu teléfono y pendiente de subir: se sincroniza al abrirlo.
                </p>
              )}
              {soloEnServidor && (
                <p className="text-muted-foreground">
                  Está en el servidor pero aún no en tu teléfono: se descarga al abrirlo.
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={irAlPerfil} disabled={abriendo}>
              {abriendo ? "Abriendo…" : onUsarExistente ? "Usar este cliente" : "Ir al perfil"}
            </Button>
            {onUsarExistente ? (
              // Desde una contrata no hay teléfono con qué comparar, solo el
              // nombre: puede ser otra persona que se llama igual.
              <Button variant="outline" onClick={onRegistrarDeTodos} disabled={abriendo}>
                Es otra persona
              </Button>
            ) : (
              <Button variant="ghost" onClick={onCancelar} disabled={abriendo}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (verificacion.tipo === "telefono") {
    return (
      <Card ref={caja} className="border-pendiente/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 size-5 shrink-0 text-pendiente" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">
                Este número de teléfono le pertenece a {verificacion.duenoDelNumero}
              </p>
              <p className="text-muted-foreground">
                {verificacion.administrador
                  ? `Es cliente de ${verificacion.administrador}.`
                  : "Es uno de tus clientes."}{" "}
                ¿Registrar de todos modos?
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onRegistrarDeTodos}>Sí</Button>
            <Button variant="outline" onClick={onCancelar}>
              No
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={caja} className="border-pendiente/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-pendiente" />
          <div className="space-y-2 text-sm">
            {verificacion.otros.map((o, i) => (
              <p key={i}>
                <span className="font-semibold">Este cliente tiene </span>
                {o.contratasActivas === 0
                  ? "historial (sin contratas activas)"
                  : `${o.contratasActivas} contrata${o.contratasActivas === 1 ? "" : "s"} activa${o.contratasActivas === 1 ? "" : "s"} (debe ${formatMoneda(o.saldo)})`}{" "}
                con <span className="font-semibold">{o.administrador}</span>.
              </p>
            ))}
            <p className="text-muted-foreground">¿Quieres entregarle tú?</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onRegistrarDeTodos}>Sí</Button>
          <Button variant="outline" onClick={onCancelar}>
            No
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
