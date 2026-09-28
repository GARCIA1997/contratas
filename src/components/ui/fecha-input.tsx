"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { Popup } from "@/components/ui/popup";
import { cn } from "@/lib/utils";

const FORMATO = "yyyy-MM-dd";
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];

function aFecha(valor: string): Date | null {
  if (!valor) return null;
  const d = parse(valor, FORMATO, new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Selector de fecha propio, en lugar de `<input type="date">`.
 *
 * El selector nativo lo dibuja el sistema operativo, no la app: en algunos
 * Android (sobre todo con el tamaño de pantalla/fuente aumentado y el zoom
 * bloqueado del viewport) se abre recortado y la última columna — el
 * sábado — queda fuera de la pantalla, sin que el CSS pueda hacer nada. Uno
 * propio se dibuja igual en todos los dispositivos: 7 columnas iguales que
 * siempre caben en el ancho del popup.
 *
 * Mismo contrato de valor que el input nativo (`yyyy-MM-dd`), para que los
 * formularios no cambien su lógica.
 */
export function FechaInput({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const seleccionada = aFecha(value);
  const [mes, setMes] = useState(() => startOfMonth(seleccionada ?? new Date()));

  function abrir() {
    setMes(startOfMonth(aFecha(value) ?? new Date()));
    setAbierto(true);
  }

  const dias = eachDayOfInterval({
    start: startOfWeek(mes, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }),
  });
  const hoy = new Date();

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={abrir}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-2xl border border-input/70 bg-secondary/50 px-4 py-2 text-left text-base transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm",
          className
        )}
      >
        <span className={cn(!seleccionada && "text-muted-foreground")}>
          {seleccionada ? format(seleccionada, "dd/MM/yyyy") : "Elegir fecha"}
        </span>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* Portal a document.body: dentro de una Card (`backdrop-filter`) el
          `position: fixed` del Popup quedaba atrapado en la tarjeta en vez
          de cubrir la pantalla. */}
      {montado &&
        createPortal(
      <Popup
        open={abierto}
        onClose={() => setAbierto(false)}
        className="max-w-[340px] p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMes(addMonths(mes, -1))}
            className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronLeft className="size-5" />
            <span className="sr-only">Mes anterior</span>
          </button>
          <p className="text-sm font-semibold capitalize">
            {format(mes, "MMMM yyyy", { locale: es })}
          </p>
          <button
            type="button"
            onClick={() => setMes(addMonths(mes, 1))}
            className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronRight className="size-5" />
            <span className="sr-only">Mes siguiente</span>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((d, i) => (
            <div
              key={i}
              className="py-1 text-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {dias.map((dia) => {
            const activo = seleccionada && isSameDay(dia, seleccionada);
            return (
              <button
                key={dia.toISOString()}
                type="button"
                onClick={() => {
                  onChange(format(dia, FORMATO));
                  setAbierto(false);
                }}
                className={cn(
                  "aspect-square min-w-0 rounded-full text-sm transition-colors",
                  !isSameMonth(dia, mes) && "text-muted-foreground/40",
                  isSameDay(dia, hoy) && !activo && "border border-primary/50",
                  activo
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                {format(dia, "d")}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            onChange(format(hoy, FORMATO));
            setAbierto(false);
          }}
          className="mt-3 w-full rounded-full py-2 text-sm font-medium text-primary hover:bg-primary/10"
        >
          Hoy
        </button>
      </Popup>,
          document.body
        )}
    </>
  );
}
