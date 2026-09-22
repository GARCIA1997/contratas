"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Popup } from "@/components/ui/popup";
import { CalculadoraBasica } from "@/components/calculadora/calculadora-basica";

/**
 * Ícono en el encabezado (junto a "preparar sin señal") que abre la
 * calculadora básica en un popup — a propósito en el header común y no
 * dentro de una sola pantalla: es una cuenta rápida que se necesita en
 * cualquier momento (cobrando, entregando, revisando un estado de cuenta),
 * no algo atado a un flujo en particular.
 */
export function CalculadoraBasicaBoton() {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        title="Calculadora"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Calculator className="size-4" />
        <span className="sr-only">Calculadora</span>
      </button>

      <Popup open={abierta} onClose={() => setAbierta(false)} className="max-w-[280px]">
        <CalculadoraBasica />
      </Popup>
    </>
  );
}
