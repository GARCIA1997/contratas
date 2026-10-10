import { MessageCircleCheck } from "lucide-react";

/** Va en lugar del botón "Enviar recibo por WhatsApp" cuando el recibo sale solo. */
export function AvisoReciboAutomatico() {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-pagado/30 bg-pagado/10 px-3 py-2 text-xs text-muted-foreground">
      <MessageCircleCheck className="mt-0.5 size-4 shrink-0 text-pagado" />
      El recibo se envía solo por WhatsApp en cuanto el cobro llega al servidor (si no hay señal, al sincronizar).
    </p>
  );
}
