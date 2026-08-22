"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MapPin, Phone, Search, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ClienteGlobalResumen } from "@/lib/services/clientes-globales";

const LARGO_MINIMO = 2;

export default function BuscarClienteGlobalPage() {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ClienteGlobalResumen[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < LARGO_MINIMO) {
      setResultados(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    setError(null);
    const controller = new AbortController();
    // Debounce: espera a que el usuario deje de escribir antes de pedir al
    // servidor — evita un fetch por cada tecla mientras teclea el nombre.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes/buscar-global?q=${encodeURIComponent(texto)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        setResultados(await res.json());
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("No se pudo buscar. Intenta de nuevo.");
      } finally {
        setBuscando(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  return (
    <div className="space-y-4 md:max-w-xl">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/clientes">
          <ArrowLeft className="size-4" /> Clientes
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Buscar en otras carteras</h1>
        <p className="text-sm text-muted-foreground">
          Encuentra si un cliente nuevo ya tiene contratas con otro
          administrador, antes de prestarle.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o teléfono del cliente…"
          className="pl-9"
          autoFocus
        />
      </div>

      {q.trim().length < LARGO_MINIMO && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Escribe al menos 2 letras del nombre, o el teléfono.
        </p>
      )}

      {q.trim().length >= LARGO_MINIMO && buscando && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Buscando…
        </div>
      )}

      {error && <p className="text-center text-sm text-destructive">{error}</p>}

      {!buscando && !error && resultados && resultados.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <UserSearch className="size-8 text-muted-foreground/60" />
          <p>Sin coincidencias en otras carteras.</p>
        </div>
      )}

      {!buscando && resultados && resultados.length > 0 && (
        <ul className="space-y-2">
          {resultados.map((c) => (
            <li key={c.id}>
              <Link href={`/clientes/buscar-global/${c.id}`}>
                <Card className="transition-colors hover:bg-secondary/40">
                  <CardContent className="space-y-1 p-4">
                    <p className="font-semibold">{c.nombre}</p>
                    {c.telefono && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="size-3" /> {c.telefono}
                      </p>
                    )}
                    {c.direccion && (
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <MapPin className="size-3 shrink-0" /> {c.direccion}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
