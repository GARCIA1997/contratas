import { redirect } from "next/navigation";
import type { TipoContrata } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { listClientes } from "@/lib/services/clientes";
import { getConfig } from "@/lib/config";
import { ContrataForm } from "@/components/contratas/contrata-form";

export const dynamic = "force-dynamic";

export default async function NuevaContrataPage({
  searchParams,
}: {
  searchParams: { tipo?: string; clienteId?: string };
}) {
  const user = await requireUser();
  if (user.rol !== "ADMIN") redirect("/contratas");

  const [clientes, config] = await Promise.all([
    listClientes(user.ownerId),
    getConfig(user.ownerId),
  ]);

  const tipoInicial: TipoContrata =
    searchParams.tipo === "QUINCENAL"
      ? "QUINCENAL"
      : searchParams.tipo === "MENSUAL"
        ? "MENSUAL"
        : "SEMANAL";

  const opciones = clientes.map((c) => ({ id: c.id, nombre: c.nombre }));
  const clientePreseleccionado = searchParams.clienteId
    ? opciones.find((c) => c.id === searchParams.clienteId)
    : undefined;

  return (
    <ContrataForm
      clientes={opciones}
      cuotasPorDefecto={config.cuotasPorDefecto}
      maxCuotas={config.maxCuotas}
      tipoInicial={tipoInicial}
      clientePreseleccionado={clientePreseleccionado}
      volverHref={
        clientePreseleccionado
          ? `/clientes/${clientePreseleccionado.id}`
          : "/contratas"
      }
    />
  );
}
