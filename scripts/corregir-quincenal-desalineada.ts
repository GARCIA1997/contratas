/**
 * Corrige contratas quincenales cuya cuota 1 quedó sin alinear a la fecha
 * fija más cercana (bug corregido en src/lib/fechas.ts — ver commit
 * "fix(fechas): alinear la cuota 1 quincenal a la fecha fija más cercana").
 *
 * NO fusiona cuotas (eso reduciría el total de pagos y le cobraría menos
 * al cliente). En su lugar:
 *   1. Calcula cuál sería el calendario CORRECTO completo (misma función
 *      ya arreglada, mismos datos: tipo/modo/fechaInicio/numCuotas).
 *   2. Verifica que las cuotas 2..N existentes coincidan EXACTO con las
 *      cuotas 1..N-1 del calendario correcto (el patrón real observado:
 *      la cuota 1 vieja era la única "de más", todo lo demás ya estaba
 *      bien encadenado a partir de ahí).
 *   3. Si coincide: renumera 2..N → 1..N-1, y convierte la vieja cuota 1
 *      en la nueva cuota N con la fecha que sigue correctamente.
 *   4. Si NO coincide exacto, o si alguna cuota ya tiene pagos, la contrata
 *      se reporta para revisión manual y no se toca.
 *
 * Por defecto corre en modo simulación (no escribe nada). Usar --aplicar
 * para ejecutar los cambios de verdad, dentro de una transacción por
 * contrata.
 *
 * Uso:
 *   DATABASE_URL="postgresql://devuser@localhost:5432/contratas" npx tsx scripts/corregir-quincenal-desalineada.ts
 *   DATABASE_URL="..." npx tsx scripts/corregir-quincenal-desalineada.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";
import { calcularFechasPago } from "../src/lib/fechas";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const contratas = await prisma.contrata.findMany({
    where: { tipo: "QUINCENAL", convertidaADeuda: false },
    include: {
      pagos: { orderBy: { numeroCuota: "asc" } },
      cliente: { select: { nombre: true } },
      owner: {
        select: { nombre: true, email: true, configuracion: { select: { modoFechasQuincenal: true } } },
      },
    },
    orderBy: { fechaInicio: "asc" },
  });

  let corregidas = 0;
  let yaCorrectas = 0;
  let requierenRevision = 0;

  for (const k of contratas) {
    if (k.pagos.length !== k.numCuotas) {
      console.log(
        `⚠️  REVISAR (conteo de pagos no coincide con numCuotas): ${k.id} — ${k.cliente.nombre} (${k.owner.nombre})`
      );
      requierenRevision++;
      continue;
    }

    const modo = k.owner.configuracion?.modoFechasQuincenal ?? "DIAS_15_Y_ULTIMO";
    const correcto = calcularFechasPago("QUINCENAL", modo, k.fechaInicio, k.numCuotas);

    // ¿Ya está bien? (las N fechas coinciden exacto con lo que generaría hoy la función ya arreglada)
    const yaAlineada = k.pagos.every((p, i) => mismoDia(p.fechaProgramada, correcto[i]));
    if (yaAlineada) {
      yaCorrectas++;
      continue;
    }

    // ¿Coincide el patrón esperado? cuotas existentes 2..N == correcto 1..N-1
    const patronExacto = k.pagos
      .slice(1)
      .every((p, i) => mismoDia(p.fechaProgramada, correcto[i]));

    if (!patronExacto) {
      console.log(
        `⚠️  REVISAR (no coincide con el patrón esperado, requiere mirar a mano): ${k.id} — ${k.cliente.nombre} (${k.owner.nombre})`
      );
      console.log(
        "   actual:  " + k.pagos.map((p) => fmt(p.fechaProgramada)).join(", ")
      );
      console.log("   correcto:" + correcto.map(fmt).join(", "));
      requierenRevision++;
      continue;
    }

    const cuotaVieja1 = k.pagos[0];
    if (cuotaVieja1.pagado || k.pagos.some((p) => p.pagado)) {
      console.log(
        `⚠️  REVISAR (tiene pagos registrados, no se toca automático): ${k.id} — ${k.cliente.nombre} (${k.owner.nombre})`
      );
      requierenRevision++;
      continue;
    }

    const nuevaFechaUltima = correcto[correcto.length - 1];

    console.log(
      `${APLICAR ? "✅ CORRIGIENDO" : "🔎 (simulación)"} ${k.id} — ${k.cliente.nombre} (admin: ${k.owner.nombre}, modo: ${modo})`
    );
    console.log(
      `   quita cuota 1 (${fmt(cuotaVieja1.fechaProgramada)}) → pasa a ser cuota ${k.numCuotas} con fecha ${fmt(nuevaFechaUltima)}`
    );
    console.log(
      `   cuotas 2..${k.numCuotas} se renumeran a 1..${k.numCuotas - 1} (fechas sin cambio)`
    );

    if (APLICAR) {
      await prisma.$transaction([
        ...k.pagos.slice(1).map((p) =>
          prisma.pago.update({
            where: { id: p.id },
            data: { numeroCuota: p.numeroCuota - 1 },
          })
        ),
        prisma.pago.update({
          where: { id: cuotaVieja1.id },
          data: { numeroCuota: k.numCuotas, fechaProgramada: nuevaFechaUltima },
        }),
      ]);
    }

    corregidas++;
  }

  console.log("\n──────────────");
  console.log(`Ya correctas: ${yaCorrectas}`);
  console.log(`${APLICAR ? "Corregidas" : "Por corregir (simulación)"}: ${corregidas}`);
  console.log(`Requieren revisión manual: ${requierenRevision}`);
  if (!APLICAR && corregidas > 0) {
    console.log("\nEsto fue una SIMULACIÓN — no se escribió nada. Corre con --aplicar para ejecutar de verdad.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
