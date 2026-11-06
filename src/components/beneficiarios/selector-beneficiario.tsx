"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { beneficiariosParecidos, buscarPorNombre, limpiarNombre } from "@/lib/beneficiarios";
import { getBeneficiariosCliente } from "@/lib/offline/repo";
import { useFuncion } from "@/lib/offline/use-funcion";

/** null = la contrata es del propio cliente (como siempre). */
export type EleccionBeneficiario = { id: string; nombre: string; nuevo: boolean } | null;

/** Lo que viaja al servidor según la elección. */
export function camposBeneficiario(e: EleccionBeneficiario) {
  if (!e) return {};
  return e.nuevo ? { beneficiarioNuevo: { id: e.id, nombre: e.nombre } } : { beneficiarioId: e.id };
}

const NUEVO = "__nuevo__";

/**
 * "¿A nombre de quién va esta contrata?" (función "beneficiarios").
 *
 * - Función apagada: no se dibuja nada (la entrega queda como siempre).
 * - Cliente sin beneficiarios: solo un enlace discreto "Esta contrata es para
 *   otra persona"; sin tocarlo, el formulario es el de siempre.
 * - Con beneficiarios: un select nativo (cómodo en el teléfono) con el propio
 *   cliente, sus beneficiarios y "Nuevo beneficiario…".
 * Al escribir un nombre nuevo se reutiliza el existente si es el mismo
 * (sin acentos ni mayúsculas) y se sugiere si se parece ("¿Es Alejandro?").
 */
export function SelectorBeneficiario({
  ownerId,
  clienteId,
  clienteNombre,
  value,
  onChange,
}: {
  ownerId: string | null | undefined;
  clienteId: string | null | undefined;
  clienteNombre: string;
  value: EleccionBeneficiario;
  onChange: (e: EleccionBeneficiario) => void;
}) {
  const activa = useFuncion("beneficiarios");
  const lista = useLiveQuery(
    () => (ownerId && clienteId ? getBeneficiariosCliente(ownerId, clienteId) : []),
    [ownerId, clienteId]
  );
  const [agregando, setAgregando] = useState(Boolean(value?.nuevo));
  const [nombre, setNombre] = useState(value?.nuevo ? value.nombre : "");
  const [idNuevo] = useState(() => (value?.nuevo ? value.id : crypto.randomUUID()));
  const [descartados, setDescartados] = useState<string[]>([]);

  // Cambió el cliente: la elección anterior ya no aplica.
  useEffect(() => {
    setAgregando(false);
    setNombre("");
    setDescartados([]);
  }, [clienteId]);

  const existentes = useMemo(() => lista ?? [], [lista]);
  const exacto = nombre ? buscarPorNombre(nombre, existentes) : undefined;
  const parecidos = useMemo(
    () =>
      nombre && !exacto
        ? beneficiariosParecidos(nombre, existentes).filter((b) => !descartados.includes(b.id))
        : [],
    [nombre, exacto, existentes, descartados]
  );

  if (!activa || !clienteId) return null;

  function escribir(texto: string) {
    setNombre(texto);
    const limpio = limpiarNombre(texto);
    if (!limpio) return onChange(null);
    const mismo = buscarPorNombre(limpio, existentes);
    onChange(mismo ? { id: mismo.id, nombre: mismo.nombre, nuevo: false } : { id: idNuevo, nombre: limpio, nuevo: true });
  }

  function cancelar() {
    setAgregando(false);
    setNombre("");
    setDescartados([]);
    onChange(null);
  }

  if (agregando) {
    return (
      <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="beneficiario-nombre">¿A nombre de quién?</Label>
          <button type="button" onClick={cancelar} className="text-muted-foreground" aria-label="Cancelar beneficiario">
            <X className="size-4" />
          </button>
        </div>
        <Input
          id="beneficiario-nombre"
          value={nombre}
          onChange={(e) => escribir(e.target.value)}
          placeholder="Ej. Alejandro (hijo)"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
        />
        {exacto && (
          <p className="text-xs text-muted-foreground">
            Ya es beneficiario de {clienteNombre}: se usará <b>{exacto.nombre}</b>.
          </p>
        )}
        {parecidos.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-background/60 px-3 py-2 text-sm">
            <span>
              ¿Es <b>{b.nombre}</b>?
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setAgregando(false);
                  setNombre("");
                  onChange({ id: b.id, nombre: b.nombre, nuevo: false });
                }}
              >
                Sí
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDescartados((d) => [...d, b.id])}>
                No
              </Button>
            </span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Los mensajes y recibos le siguen llegando a {clienteNombre}.
        </p>
      </div>
    );
  }

  if (existentes.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setAgregando(true)}
        className="flex items-center gap-1.5 text-sm font-medium text-primary"
      >
        <UserPlus className="size-4" /> Esta contrata es para otra persona
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="beneficiario">Beneficiario</Label>
      <Select
        id="beneficiario"
        value={value && !value.nuevo ? value.id : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === NUEVO) {
            setAgregando(true);
            onChange(null);
            return;
          }
          const b = existentes.find((x) => x.id === v);
          onChange(b ? { id: b.id, nombre: b.nombre, nuevo: false } : null);
        }}
      >
        <option value="">{clienteNombre} (titular)</option>
        {existentes.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nombre}
          </option>
        ))}
        <option value={NUEVO}>＋ Nuevo beneficiario…</option>
      </Select>
    </div>
  );
}
