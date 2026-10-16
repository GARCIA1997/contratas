"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { linkWhatsApp } from "@/lib/whatsapp";
import { mensajePresentacionCliente } from "@/lib/mensajes-whatsapp";
import { nombreRemitente } from "@/lib/whatsapp-auto/textos";
import { getConfiguracion } from "@/lib/offline/repo";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";

/**
 * Botón para mandarle a un cliente recién registrado el mensaje de
 * presentación. Siempre manual y para todos (con o sin WhatsApp
 * automático): lo decide quien registra, en el momento.
 */
export function PresentacionCliente({ cliente }: { cliente: { nombre: string; telefono: string | null } }) {
  const claims = useAuthClaims();
  const ownerId = claims.ready ? claims.ownerId : null;
  const config = useLiveQuery(() => (ownerId ? getConfiguracion(ownerId) : undefined), [ownerId]);
  const mensaje = mensajePresentacionCliente({
    nombreApp: config?.nombreApp ?? "Kredired",
    clienteNombre: cliente.nombre,
    remitente: nombreRemitente(claims.ready ? claims.nombre : null),
  });

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-2 p-4 text-sm">
        <p className="font-medium">Preséntate con {cliente.nombre}</p>
        <p className="text-xs text-muted-foreground">
          Mándale un mensaje de bienvenida para que guarde el número y reconozca sus recibos.
        </p>
        <Button className="w-full" asChild>
          <a href={linkWhatsApp(cliente.telefono, mensaje)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" />
            {cliente.telefono ? "Enviar presentación por WhatsApp" : "Compartir presentación por WhatsApp"}
          </a>
        </Button>
        {!cliente.telefono && (
          <p className="text-center text-xs text-muted-foreground">
            Sin teléfono guardado: elige el contacto al abrir WhatsApp.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
