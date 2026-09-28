"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ModoQuincenal, TipoContrata } from "@prisma/client";
import { sugerirPrimerPago } from "@/lib/fechas";
import { getConfiguracion } from "@/lib/offline/repo";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";
import { CONFIG_DEFAULTS } from "@/lib/config";

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Estado de la fecha del primer pago en los formularios que entregan una
 * contrata (nueva, renovar, unificar). Arranca con `sugerirPrimerPago` según
 * el tipo, la fecha de entrega y la configuración del usuario (día de cobro
 * semanal, modo quincenal), y se vuelve a sugerir si cambia el tipo — hasta
 * que el usuario la edite a mano: a partir de ahí se respeta lo que eligió.
 *
 * `fija` (p. ej. al editar una contrata existente) desactiva la sugerencia.
 */
export function usePrimerPago(
  tipo: TipoContrata,
  entrega: string = hoyISO(),
  fija?: string
): [string, (valor: string) => void] {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const config = useLiveQuery(
    () => (ownerId ? getConfiguracion(ownerId) : undefined),
    [ownerId]
  );
  const modo = (config?.modoFechasQuincenal ??
    CONFIG_DEFAULTS.modoFechasQuincenal) as ModoQuincenal;
  const diaCobro = config?.diaCobroSemanal ?? CONFIG_DEFAULTS.diaCobroSemanal;

  const [fecha, setFecha] = useState(
    () => fija ?? sugerirPrimerPago(tipo, new Date(`${entrega}T00:00:00`), modo, diaCobro)
  );
  const tocada = useRef(!!fija);

  useEffect(() => {
    if (tocada.current) return;
    setFecha(sugerirPrimerPago(tipo, new Date(`${entrega}T00:00:00`), modo, diaCobro));
  }, [tipo, entrega, modo, diaCobro]);

  return [
    fecha,
    (valor: string) => {
      tocada.current = true;
      setFecha(valor);
    },
  ];
}
