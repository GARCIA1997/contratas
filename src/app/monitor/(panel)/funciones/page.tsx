import { FUNCIONES, type ClaveFuncion } from "@/lib/funciones";
import { tablaFunciones } from "@/lib/services/funciones";
import { fechaHora } from "@/components/monitor/formato";
import { Encabezado, Tarjeta, Vacio } from "@/components/monitor/ui";
import { InterruptorFuncion } from "@/components/monitor/interruptor-funcion";

export const dynamic = "force-dynamic";

export default async function FuncionesPage() {
  const { duenos, estado } = await tablaFunciones();
  const claves = Object.keys(FUNCIONES) as ClaveFuncion[];

  return (
    <>
      <Encabezado
        titulo="Funciones en prueba"
        subtitulo="Se encienden por espacio de trabajo: el dueño y sus miembros ven lo mismo. Apagada, la app se ve como antes."
      />
      {claves.map((clave) => {
        const f = FUNCIONES[clave];
        const encendidas = duenos.filter((d) => estado(d.id, clave)?.activa).length;
        return (
          <Tarjeta key={clave} className="gap-space-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-headline-sm text-headline-sm text-on-surface">{f.nombre}</span>
              <span className="font-label-sm text-label-sm text-outline">
                {encendidas} de {duenos.length} usuarios
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{f.descripcion}</p>
            {duenos.length === 0 ? (
              <Vacio texto="Sin usuarios." />
            ) : (
              <ul className="divide-y divide-outline-variant/30">
                {duenos.map((d) => {
                  const e = estado(d.id, clave);
                  const nombre = d.nombre ?? d.email;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-space-sm py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-body-md text-body-md text-on-surface">{nombre}</p>
                        {e && (
                          <p className="font-label-sm text-label-sm text-outline">
                            {e.activa ? "Encendida" : "Apagada"} por {e.actualizadoPor ?? "?"} · {fechaHora(e.actualizadoEn.toISOString())}
                          </p>
                        )}
                      </div>
                      <InterruptorFuncion
                        ownerId={d.id}
                        clave={clave}
                        activa={e?.activa ?? false}
                        usuario={nombre}
                        funcion={f.nombre}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        );
      })}
    </>
  );
}
