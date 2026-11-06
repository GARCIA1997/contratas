/**
 * Catálogo de funciones en prueba. Se encienden por espacio de trabajo desde
 * Monitor → Funciones (tabla FuncionEspacio). Sin fila o apagada, el espacio
 * ve la app exactamente como antes.
 *
 * Archivo sin dependencias de servidor: lo leen la app (también sin señal)
 * y el monitor.
 */
export const FUNCIONES = {
  beneficiarios: {
    nombre: "Beneficiarios",
    descripcion:
      "Contratas a nombre de otras personas que cobra el cliente (su hijo, una comadre…): selector al entregar, sección en el perfil, cobro por persona en Ruta y Abonar.",
  },
} as const;

export type ClaveFuncion = keyof typeof FUNCIONES;

export function esClaveFuncion(clave: string): clave is ClaveFuncion {
  return Object.prototype.hasOwnProperty.call(FUNCIONES, clave);
}
