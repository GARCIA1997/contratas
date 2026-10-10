import { AsyncLocalStorage } from "node:async_hooks";
import { registrarAlmacen } from "./contexto-operacion";

const almacen = new AsyncLocalStorage<{ clave: string }>();
registrarAlmacen(almacen);

export function conClaveOperacion<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  return almacen.run({ clave }, fn);
}
