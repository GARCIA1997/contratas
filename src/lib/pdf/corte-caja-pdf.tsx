import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { CorteCaja } from "@prisma/client";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function moneda(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { marginBottom: 20, borderBottom: "2 solid #0F7BFF", paddingBottom: 10 },
  appName: { fontSize: 18, fontWeight: 700, color: "#0F7BFF" },
  titulo: { fontSize: 14, fontWeight: 700, marginTop: 4 },
  subtitulo: { fontSize: 10, color: "#666666", marginTop: 2 },
  seccion: { marginTop: 16 },
  seccionTitulo: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
    color: "#333333",
  },
  fila: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottom: "1 solid #eeeeee",
  },
  filaLabel: { color: "#555555" },
  filaValor: { fontWeight: 700 },
  destacado: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f0f6ff",
    borderRadius: 4,
  },
  destacadoLabel: { fontSize: 12, fontWeight: 700 },
  destacadoValor: { fontSize: 16, fontWeight: 700, color: "#0F7BFF" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#999999",
    textAlign: "center",
  },
});

export function CorteCajaPdf({
  corte,
  nombreApp,
}: {
  corte: CorteCaja;
  nombreApp: string;
}) {
  const balance = corte.cobrado - corte.contratasDadas;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.appName}>{nombreApp}</Text>
          <Text style={styles.titulo}>
            Estado de resultados — {MESES[corte.mes - 1]} {corte.anio}
          </Text>
          <Text style={styles.subtitulo}>
            Generado el{" "}
            {new Date(corte.generadoEn).toLocaleString("es-MX", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </Text>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Movimiento del mes</Text>
          <View style={styles.fila}>
            <Text style={styles.filaLabel}>
              Contratas dadas ({corte.numContratasDadas})
            </Text>
            <Text style={styles.filaValor}>{moneda(corte.contratasDadas)}</Text>
          </View>
          <View style={styles.fila}>
            <Text style={styles.filaLabel}>Cobrado</Text>
            <Text style={styles.filaValor}>{moneda(corte.cobrado)}</Text>
          </View>
          <View style={styles.fila}>
            <Text style={styles.filaLabel}>Ganancia real (interés cobrado)</Text>
            <Text style={styles.filaValor}>{moneda(corte.gananciaInteres)}</Text>
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Cartera al cierre</Text>
          <View style={styles.fila}>
            <Text style={styles.filaLabel}>Contratas activas</Text>
            <Text style={styles.filaValor}>{corte.contratasActivasFin}</Text>
          </View>
          <View style={styles.fila}>
            <Text style={styles.filaLabel}>Saldo pendiente</Text>
            <Text style={styles.filaValor}>
              {moneda(corte.saldoPendienteFin)}
            </Text>
          </View>
        </View>

        <View style={styles.destacado}>
          <Text style={styles.destacadoLabel}>
            Balance del mes (cobrado − dado)
          </Text>
          <Text style={styles.destacadoValor}>{moneda(balance)}</Text>
        </View>

        <Text style={styles.footer}>
          {nombreApp} · Corte generado automáticamente, no incluye ajustes
          posteriores a la fecha de generación.
        </Text>
      </Page>
    </Document>
  );
}
