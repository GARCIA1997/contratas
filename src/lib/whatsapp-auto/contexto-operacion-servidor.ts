import { AsyncLocalStorage } from "node:async_hooks";
import { registrarAlmacen } from "./contexto-operacion";

const almacen = new AsyncLocalStorage<{ clave: string; captura?: string | null }>();
registrarAlmacen(almacen);

export function conClaveOperacion<T>(clave: string, fn: () => Promise<T>, captura?: string | null): Promise<T> {
  return almacen.run({ clave, captura }, fn);
}
