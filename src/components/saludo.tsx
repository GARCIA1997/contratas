"use client";

import { useEffect, useState } from "react";

function calcularSaludo(hora: number): string {
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Saludo estilo "large title" según la hora local del dispositivo. */
export function Saludo({ nombre }: { nombre?: string | null }) {
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    setTexto(calcularSaludo(new Date().getHours()));
  }, []);

  const primerNombre = nombre?.trim().split(/\s+/)[0];

  return (
    <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
      {texto ?? "Hola"}
      {primerNombre && (
        <>
          <br />
          {primerNombre}
        </>
      )}
    </h1>
  );
}
