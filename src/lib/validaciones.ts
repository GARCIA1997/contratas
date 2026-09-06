import { z } from "zod";

/**
 * `id` opcional generado por el cliente: lo manda la cola offline al crear
 * sin señal, para que el registro nazca con su id definitivo. Sin esto,
 * una contrata creada offline para un cliente también creado offline
 * apuntaría a un id temporal que el servidor no conoce. Es seguro: crear
 * con un id que ya existe viola la llave primaria y falla, nunca pisa un
 * registro ajeno.
 */
const idGeneradoEnCliente = z.string().trim().min(1).max(64).optional();

export const clienteSchema = z.object({
  id: idGeneradoEnCliente,
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  telefono: z.string().trim().max(30).optional().nullable(),
  direccion: z.string().trim().max(200).optional().nullable(),
  referencia: z.string().trim().max(200).optional().nullable(),
  notas: z.string().trim().max(500).optional().nullable(),
});

export const contrataSchema = z.object({
  clienteId: z.string().min(1).optional(),
  // Alternativa: crear cliente nuevo inline
  clienteNombre: z.string().trim().min(1).max(120).optional(),
  tipo: z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"]),
  monto: z.number().positive("El monto debe ser mayor a 0"),
  abono: z.number().positive("El abono debe ser mayor a 0"),
  fechaInicio: z.string().datetime().or(z.string().min(1)),
  numCuotas: z.number().int().min(1).max(52),
  notas: z.string().trim().max(500).optional().nullable(),
});

export const contrataUpdateSchema = contrataSchema.partial();

const nuevaContrataBaseSchema = z.object({
  tipo: z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"]),
  monto: z.number().positive("El monto debe ser mayor a 0"),
  abono: z.number().positive("El abono debe ser mayor a 0"),
  fechaInicio: z.string().datetime().or(z.string().min(1)),
  numCuotas: z.number().int().min(1).max(52),
  notas: z.string().trim().max(500).optional().nullable(),
});

export const renovarContrataSchema = nuevaContrataBaseSchema.extend({
  incluirOtras: z.boolean().default(false),
});

export const unificarContratasSchema = nuevaContrataBaseSchema.extend({
  contrataIds: z.array(z.string().min(1)).min(2, "Selecciona al menos dos contratas"),
});

export const citaSchema = z.object({
  clienteId: z.string().min(1, "Elige un cliente"),
  contrataOrigenId: z.string().min(1).optional().nullable(),
  tipo: z.enum(["NUEVA", "RENOVACION", "SIN_DEFINIR"]).default("SIN_DEFINIR"),
  /** Cada cuánto pagará la contrata que salga de la cita. Nullable: puede
   *  no saberse al agendar y se decide al entregar. */
  periodicidad: z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"]).optional().nullable(),
  montoEstimado: z.number().positive("El monto debe ser mayor a 0"),
  fechaEntrega: z.string().datetime().or(z.string().min(1)),
  notas: z.string().trim().max(500).optional().nullable(),
  /** Solo en el camino offline: id generado en el cliente para que el
   *  efecto optimista y el registro real del servidor compartan PK. */
  id: z.string().min(1).optional(),
});

export const citaUpdateSchema = citaSchema.omit({ id: true }).partial();

export const deudorSchema = z.object({
  id: idGeneradoEnCliente,
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  deudaInicial: z.number().min(0, "La deuda no puede ser negativa"),
  notas: z.string().trim().max(500).optional().nullable(),
});

export const abonoSchema = z.object({
  fecha: z.string().min(1),
  monto: z.number().positive("El abono debe ser mayor a 0"),
  notas: z.string().trim().max(500).optional().nullable(),
});

export const configSchema = z.object({
  nombreApp: z.string().trim().min(1).max(60),
  tasaSemanal: z.number().min(0),
  tasaQuincenal: z.number().min(0),
  tasaMensual: z.number().min(0),
  cuotasPorDefecto: z.number().int().min(1).max(52),
  maxCuotas: z.number().int().min(1).max(52),
  modoFechasQuincenal: z.enum(["QUINCE_DIAS", "DIAS_15_Y_ULTIMO", "DIAS_1_Y_15"]),
  diaCobroSemanal: z.number().int().min(0).max(6),
  colorPrimario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (#rrggbb)"),
  logoUrl: z.string().trim().max(500).optional().nullable().or(z.literal("")),
});

export const registroSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  email: z
    .string()
    .trim()
    .min(4, "Mínimo 4 caracteres")
    .max(160),
  password: z.string().min(6, "Mínimo 6 caracteres").max(100),
});

export const usuarioSchema = z.object({
  nombre: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(160),
  password: z.string().min(6, "Mínimo 6 caracteres").max(100),
  rol: z.enum(["ADMIN", "VIEWER"]),
});

export const usuarioUpdateSchema = z.object({
  nombre: z.string().trim().max(120).optional().nullable(),
  rol: z.enum(["ADMIN", "VIEWER"]).optional(),
  password: z.string().min(6).max(100).optional(),
});

export type ClienteInput = z.infer<typeof clienteSchema>;
export type ContrataInput = z.infer<typeof contrataSchema>;
export type DeudorInput = z.infer<typeof deudorSchema>;
export type AbonoInput = z.infer<typeof abonoSchema>;
export type ConfigInput = z.infer<typeof configSchema>;
export type UsuarioInput = z.infer<typeof usuarioSchema>;
export type RegistroInput = z.infer<typeof registroSchema>;
export type RenovarContrataInput = z.infer<typeof renovarContrataSchema>;
export type UnificarContratasInput = z.infer<typeof unificarContratasSchema>;
export type CitaInput = z.infer<typeof citaSchema>;
export type CitaUpdateInput = z.infer<typeof citaUpdateSchema>;
