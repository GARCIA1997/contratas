"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Operador = "+" | "−" | "×" | "÷";

/** Redondea a 10 decimales antes de mostrar — evita artefactos de punto
 *  flotante tipo "0.1 + 0.2 = 0.30000000000000004" en pantalla. */
function limpiar(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

function formatearDisplay(valor: string): string {
  if (valor === "Error") return valor;
  const n = Number(valor);
  if (!Number.isFinite(n)) return "Error";
  // Separador de miles solo en la parte entera — no tocar lo que el
  // usuario esté escribiendo después del punto decimal.
  const [entero, decimal] = valor.split(".");
  const enteroFmt = new Intl.NumberFormat("es-MX").format(Number(entero));
  return decimal !== undefined ? `${enteroFmt}.${decimal}` : enteroFmt;
}

/**
 * Calculadora aritmética simple (suma, resta, multiplicación, división,
 * porcentaje, cambio de signo) — la misma mecánica secuencial de cualquier
 * calculadora de bolsillo, sin precedencia de operadores ni paréntesis: no
 * es para el negocio (esa es la "Calculadora" de préstamos del menú), es
 * para la cuenta rápida que un cobrador hace en la calle — cuánto suman
 * varios cobros, un cambio, etc.
 */
export function CalculadoraBasica() {
  const [display, setDisplay] = useState("0");
  const [acumulador, setAcumulador] = useState<number | null>(null);
  const [operador, setOperador] = useState<Operador | null>(null);
  // true justo después de una tecla de operador o "=": el siguiente dígito
  // empieza un número nuevo en vez de pegarse al resultado anterior.
  const [sobrescribir, setSobrescribir] = useState(false);

  function limpiarTodo() {
    setDisplay("0");
    setAcumulador(null);
    setOperador(null);
    setSobrescribir(false);
  }

  function presionarDigito(d: string) {
    if (display === "Error" || sobrescribir) {
      setDisplay(d);
      setSobrescribir(false);
      return;
    }
    // Sin esto, "0" + "5" da "05" en vez de "5".
    setDisplay(display === "0" ? d : display + d);
  }

  function presionarPunto() {
    if (display === "Error" || sobrescribir) {
      setDisplay("0.");
      setSobrescribir(false);
      return;
    }
    if (!display.includes(".")) setDisplay(display + ".");
  }

  function cambiarSigno() {
    if (display === "Error") return;
    setDisplay(display.startsWith("-") ? display.slice(1) : `-${display}`);
  }

  function porcentaje() {
    if (display === "Error") return;
    setDisplay(String(limpiar(parseFloat(display) / 100)));
  }

  function borrarUltimo() {
    if (display === "Error" || sobrescribir) return limpiarTodo();
    setDisplay(display.length > 1 ? display.slice(0, -1) : "0");
  }

  function operar(a: number, b: number, op: Operador): number {
    switch (op) {
      case "+":
        return a + b;
      case "−":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        // División entre 0: se muestra "Error" en vez de Infinity/NaN —
        // una calculadora de bolsillo nunca te deja ver "Infinity".
        return b === 0 ? NaN : a / b;
    }
  }

  function presionarOperador(op: Operador) {
    if (display === "Error") return;
    const actual = parseFloat(display);
    if (acumulador !== null && operador && !sobrescribir) {
      const resultado = operar(acumulador, actual, operador);
      setAcumulador(resultado);
      setDisplay(Number.isFinite(resultado) ? String(limpiar(resultado)) : "Error");
    } else {
      setAcumulador(actual);
    }
    setOperador(op);
    setSobrescribir(true);
  }

  function presionarIgual() {
    if (display === "Error" || acumulador === null || operador === null) return;
    const actual = parseFloat(display);
    const resultado = operar(acumulador, actual, operador);
    setDisplay(Number.isFinite(resultado) ? String(limpiar(resultado)) : "Error");
    setAcumulador(null);
    setOperador(null);
    setSobrescribir(true);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-muted px-4 py-5 text-right">
        {operador && (
          <p className="truncate text-xs text-muted-foreground">
            {formatearDisplay(String(acumulador ?? 0))} {operador}
          </p>
        )}
        <p className="truncate text-3xl font-bold tabular-nums">
          {formatearDisplay(display)}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <TeclaCalc etiqueta="C" variante="funcion" onClick={limpiarTodo} />
        <TeclaCalc etiqueta="±" variante="funcion" onClick={cambiarSigno} />
        <TeclaCalc etiqueta="%" variante="funcion" onClick={porcentaje} />
        <TeclaCalc
          etiqueta="÷"
          variante="operador"
          activa={operador === "÷" && sobrescribir}
          onClick={() => presionarOperador("÷")}
        />

        {["7", "8", "9"].map((d) => (
          <TeclaCalc key={d} etiqueta={d} onClick={() => presionarDigito(d)} />
        ))}
        <TeclaCalc
          etiqueta="×"
          variante="operador"
          activa={operador === "×" && sobrescribir}
          onClick={() => presionarOperador("×")}
        />

        {["4", "5", "6"].map((d) => (
          <TeclaCalc key={d} etiqueta={d} onClick={() => presionarDigito(d)} />
        ))}
        <TeclaCalc
          etiqueta="−"
          variante="operador"
          activa={operador === "−" && sobrescribir}
          onClick={() => presionarOperador("−")}
        />

        {["1", "2", "3"].map((d) => (
          <TeclaCalc key={d} etiqueta={d} onClick={() => presionarDigito(d)} />
        ))}
        <TeclaCalc
          etiqueta="+"
          variante="operador"
          activa={operador === "+" && sobrescribir}
          onClick={() => presionarOperador("+")}
        />

        <TeclaCalc etiqueta="0" className="col-span-2" onClick={() => presionarDigito("0")} />
        <TeclaCalc etiqueta="." onClick={presionarPunto} />
        <TeclaCalc etiqueta="=" variante="igual" onClick={presionarIgual} />
      </div>

      <button
        type="button"
        onClick={borrarUltimo}
        className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" /> Borrar último dígito
      </button>
    </div>
  );
}

function TeclaCalc({
  etiqueta,
  onClick,
  variante = "digito",
  activa = false,
  className,
}: {
  etiqueta: string;
  onClick: () => void;
  variante?: "digito" | "funcion" | "operador" | "igual";
  activa?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-14 rounded-2xl text-lg font-semibold transition-colors active:scale-95",
        variante === "digito" && "bg-secondary/60 hover:bg-secondary",
        variante === "funcion" &&
          "bg-muted text-muted-foreground hover:bg-muted/70",
        variante === "operador" &&
          cn(
            "bg-primary/10 text-primary hover:bg-primary/20",
            activa && "bg-primary text-primary-foreground hover:bg-primary"
          ),
        variante === "igual" && "bg-primary text-primary-foreground hover:bg-primary/90",
        className
      )}
    >
      {etiqueta}
    </button>
  );
}
