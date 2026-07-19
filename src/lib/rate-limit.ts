import { prisma } from "@/lib/prisma";

/**
 * Rate limiting de login contra fuerza bruta, respaldado en la base de datos
 * (sobrevive reinicios/deploys, a diferencia de un contador en memoria).
 *
 * Se bloquea por dos criterios en una ventana móvil:
 *  - Demasiados fallos contra un mismo email (ataque dirigido a una cuenta).
 *  - Demasiados fallos desde una misma IP (barrido de varias cuentas).
 */

const VENTANA_MIN = 15;
const MAX_POR_EMAIL = 8;
const MAX_POR_IP = 25;

function desde(): Date {
  return new Date(Date.now() - VENTANA_MIN * 60 * 1000);
}

/** Registra un intento de login (exitoso o fallido). Nunca lanza. */
export async function registrarIntentoLogin(
  email: string,
  ip: string,
  exitoso: boolean
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: { email: email.toLowerCase(), ip, exitoso },
    });
  } catch {
    // El registro nunca debe impedir el login en sí.
  }
}

/**
 * true si este email o IP superó el umbral de intentos fallidos en la
 * ventana. Solo cuentan los fallidos: un login exitoso previo no gasta cupo.
 */
export async function loginBloqueado(
  email: string,
  ip: string
): Promise<boolean> {
  const gte = desde();
  try {
    const [fallosEmail, fallosIp] = await Promise.all([
      prisma.loginAttempt.count({
        where: { email: email.toLowerCase(), exitoso: false, creadoEn: { gte } },
      }),
      prisma.loginAttempt.count({
        where: { ip, exitoso: false, creadoEn: { gte } },
      }),
    ]);
    return fallosEmail >= MAX_POR_EMAIL || fallosIp >= MAX_POR_IP;
  } catch {
    // Si la consulta falla, no bloqueamos (preferimos disponibilidad).
    return false;
  }
}
