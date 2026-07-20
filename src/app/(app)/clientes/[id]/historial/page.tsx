import { notFound } from "next/navigation";
import { HttpError, requireUser } from "@/lib/session";
import { getHistorialCliente } from "@/lib/services/clientes";
import { HistorialView } from "@/components/clientes/historial-view";

export const dynamic = "force-dynamic";

export default async function HistorialClientePage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  try {
    const historial = await getHistorialCliente(user.ownerId, params.id);
    return (
      <HistorialView
        clienteId={historial.id}
        nombre={historial.nombre}
        eventos={historial.eventos.map((e) => ({
          ...e,
          fecha: e.fecha.toISOString(),
        }))}
      />
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
