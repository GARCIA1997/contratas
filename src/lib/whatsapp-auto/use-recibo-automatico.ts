"use client";

import { useEffect, useState } from "react";

/**
 * ¿Los recibos de cobro de este espacio salen solos por WhatsApp? Si sí, la
 * app no ofrece el envío manual del recibo (llegaría dos veces).
 *
 * Se consulta UNA vez por carga (la Ruta monta un botón por cliente) y se
 * guarda en el teléfono: sin señal se usa lo último que se supo. Si nunca se
 * pudo consultar, se asume que no (el manual sigue disponible).
 */

type EstadoCuenta = { activo: boolean; recibos: boolean } | null;

const clave = (ownerId: string) => `kredired:wa-recibo-auto:${ownerId}`;
const VIGENCIA_MS = 5 * 60 * 1000;
let consulta: { ownerId: string; en: number; promesa: Promise<boolean | null> } | null = null;

/**
 * Misma condición con la que el servidor genera el recibo (recibos.ts). No
 * depende de que el número esté conectado o sin pausa: el recibo se genera
 * igual y sale al reanudar, así que ofrecer el manual lo duplicaría.
 */
export function reciboAutomaticoDe(c: EstadoCuenta): boolean {
  return Boolean(c && c.activo && c.recibos);
}

function guardar(ownerId: string, c: EstadoCuenta) {
  try {
    localStorage.setItem(clave(ownerId), reciboAutomaticoDe(c) ? "1" : "0");
  } catch {
    // Sin almacenamiento: se vuelve a consultar la próxima vez.
  }
}

/** Configuración cambió (tarjeta de WhatsApp): se guarda y se olvida la consulta en memoria. */
export function recordarReciboAutomatico(ownerId: string, c: EstadoCuenta) {
  guardar(ownerId, c);
  consulta = null;
}

function leer(ownerId: string): boolean {
  try {
    return localStorage.getItem(clave(ownerId)) === "1";
  } catch {
    return false;
  }
}

function consultar(ownerId: string): Promise<boolean | null> {
  if (consulta && consulta.ownerId === ownerId && Date.now() - consulta.en < VIGENCIA_MS) return consulta.promesa;
  const promesa = fetch("/api/whatsapp", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<EstadoCuenta>) : Promise.reject()))
    .then((c) => {
      guardar(ownerId, c);
      return reciboAutomaticoDe(c);
    })
    .catch(() => null);
  consulta = { ownerId, en: Date.now(), promesa };
  return promesa;
}

export function useReciboAutomatico(ownerId: string | null | undefined): boolean {
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    if (!ownerId) return;
    setActivo(leer(ownerId));
    let vivo = true;
    void consultar(ownerId).then((v) => {
      if (vivo && v !== null) setActivo(v);
    });
    return () => {
      vivo = false;
    };
  }, [ownerId]);
  return activo;
}
