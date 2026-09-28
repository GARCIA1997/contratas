"use client";

import { modoLocalActivo } from "@/lib/offline/modo-local";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Estado = "cargando" | "no-soportado" | "deshabilitado" | "activa" | "inactiva";

export function NotificacionesPanel() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [vapidKey, setVapidKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setEstado("no-soportado");
        return;
      }
      const res = await fetch("/api/push/public-key");
      const data = await res.json();
      if (!data.enabled || !data.key) {
        setEstado("deshabilitado");
        return;
      }
      setVapidKey(data.key);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "activa" : "inactiva");
    })().catch(() => setEstado("no-soportado"));
  }, []);

  async function activar() {
    setOcupado(true);
    setMsg(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setMsg("Permiso denegado.");
        setOcupado(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setEstado("activa");
      setMsg("Notificaciones activadas.");
    } catch {
      setMsg("No se pudo activar.");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("inactiva");
      setMsg("Notificaciones desactivadas.");
    } catch {
      setMsg("No se pudo desactivar.");
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    if (modoLocalActivo()) return setMsg("Enciende la sincronización para hacer este cambio.");
    setOcupado(true);
    setMsg(null);
    const res = await fetch("/api/push/recordatorio", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Enviadas: ${data.enviadas}` : data.error ?? "Error");
    setOcupado(false);
  }

  if (estado === "cargando") return null;

  if (estado === "no-soportado") {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Este dispositivo no soporta notificaciones push.
      </p>
    );
  }

  if (estado === "deshabilitado") {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Notificaciones no configuradas en el servidor (faltan claves VAPID).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {estado === "inactiva" ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={activar}
          disabled={ocupado}
        >
          <Bell className="size-4" /> Activar recordatorios de cobros
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={probar}
            disabled={ocupado}
          >
            <Bell className="size-4" /> Probar
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            onClick={desactivar}
            disabled={ocupado}
          >
            <BellOff className="size-4" /> Desactivar
          </Button>
        </div>
      )}
      {msg && (
        <p className="text-center text-xs text-muted-foreground">{msg}</p>
      )}
    </div>
  );
}
