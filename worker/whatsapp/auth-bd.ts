import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from "baileys";
import { prisma } from "@/lib/prisma";
import { cifrar, descifrar } from "./cifrado";

/**
 * Estado de autenticación de Baileys guardado en Postgres (cifrado), en vez
 * de `useMultiFileAuthState` (archivos en disco: se pierden con cada deploy
 * y no van cifrados). Cada llave de Signal es un renglón de WhatsAppLlave.
 */
export async function authDesdeBD(cuentaId: string) {
  async function leer<T>(tipo: string, llaveId: string): Promise<T | null> {
    const r = await prisma.whatsAppLlave.findUnique({
      where: { cuentaId_tipo_llaveId: { cuentaId, tipo, llaveId } },
    });
    return r ? (JSON.parse(descifrar(r.valor), BufferJSON.reviver) as T) : null;
  }

  function escribir(tipo: string, llaveId: string, valor: unknown) {
    const cifrado = cifrar(JSON.stringify(valor, BufferJSON.replacer));
    return prisma.whatsAppLlave.upsert({
      where: { cuentaId_tipo_llaveId: { cuentaId, tipo, llaveId } },
      create: { cuentaId, tipo, llaveId, valor: cifrado },
      update: { valor: cifrado },
    });
  }

  const creds: AuthenticationCreds = (await leer<AuthenticationCreds>("creds", "")) ?? initAuthCreds();

  const keys: SignalKeyStore = {
    async get(type, ids) {
      const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
      await Promise.all(
        ids.map(async (id) => {
          let valor = await leer<SignalDataTypeMap[typeof type]>(type, id);
          if (type === "app-state-sync-key" && valor) {
            valor = proto.Message.AppStateSyncKeyData.fromObject(valor) as unknown as SignalDataTypeMap[typeof type];
          }
          if (valor) data[id] = valor;
        })
      );
      return data;
    },
    async set(data) {
      const escrituras = [];
      const borrar: { tipo: string; llaveId: string }[] = [];
      for (const tipo of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
        for (const [id, valor] of Object.entries(data[tipo] ?? {})) {
          if (valor) escrituras.push(escribir(tipo, id, valor));
          else borrar.push({ tipo, llaveId: id });
        }
      }
      await prisma.$transaction([
        ...escrituras,
        ...borrar.map((b) => prisma.whatsAppLlave.deleteMany({ where: { cuentaId, ...b } })),
      ]);
    },
  };

  return {
    state: { creds, keys },
    guardarCreds: () => escribir("creds", "", creds),
  };
}

export async function tieneSesion(cuentaId: string): Promise<boolean> {
  const r = await prisma.whatsAppLlave.findUnique({
    where: { cuentaId_tipo_llaveId: { cuentaId, tipo: "creds", llaveId: "" } },
    select: { valor: true },
  });
  if (!r) return false;
  const creds = JSON.parse(descifrar(r.valor), BufferJSON.reviver) as AuthenticationCreds;
  return Boolean(creds.registered || creds.me?.id);
}

export async function borrarSesion(cuentaId: string) {
  await prisma.whatsAppLlave.deleteMany({ where: { cuentaId } });
}
