"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { esAndroid, guardarAppWhatsApp, leerAppWhatsApp, type AppWhatsApp } from "@/lib/whatsapp-app";

const OPCIONES: { valor: AppWhatsApp; texto: string }[] = [
  { valor: "sistema", texto: "La que elija el teléfono" },
  { valor: "normal", texto: "WhatsApp" },
  { valor: "business", texto: "WhatsApp Business" },
];

/** Configuración → Aplicación: qué WhatsApp abren los envíos manuales en este teléfono. */
export function AppWhatsAppSelector() {
  const [app, setApp] = useState<AppWhatsApp>("sistema");
  const [android, setAndroid] = useState(true);

  useEffect(() => {
    setApp(leerAppWhatsApp());
    setAndroid(esAndroid(navigator.userAgent));
  }, []);

  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <label htmlFor="app-whatsapp" className="flex items-center gap-2 font-medium">
          <MessageCircle className="size-4 text-muted-foreground" />
          Abrir los envíos manuales en
        </label>
        <select
          id="app-whatsapp"
          value={app}
          disabled={!android}
          onChange={(e) => {
            const v = e.target.value as AppWhatsApp;
            setApp(v);
            guardarAppWhatsApp(v);
          }}
          className="h-9 w-full rounded-md border bg-background px-2 disabled:opacity-60"
        >
          {OPCIONES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {android
            ? "Solo en este teléfono. Útil si tienes WhatsApp y WhatsApp Business con números distintos."
            : "En iPhone no se puede elegir: abre la app que decida el teléfono."}
        </p>
      </CardContent>
    </Card>
  );
}
