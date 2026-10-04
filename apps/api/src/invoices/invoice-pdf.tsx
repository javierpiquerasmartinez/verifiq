import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import {
  exemptionGround,
  formatAmount,
  formatIban,
  formatSpanishDate,
  formatWithheld,
  type InvoiceSnapshot,
} from '@verifiq/domain';
import { createRequire } from 'node:module';
import type { ReactNode } from 'react';

// The PDF of an issued invoice, drawn from its frozen copy. Its content is the one the Reglamento de
// facturación requires; the QR tributario goes at the top of the first page, centred, as the VeriFactu
// order (HAC/1177/2024) asks: 30–40 mm, with a quiet zone, "QR tributario:" above and "VERI*FACTU"
// below in type no smaller than the invoice's data.

const require = createRequire(import.meta.url);
const FONT = 'IBM Plex Sans';
Font.register({
  family: FONT,
  fonts: [
    { src: require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff') },
    { src: require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff'), fontWeight: 600 },
  ],
});
// Words are never split: names, tax IDs and amounts must read whole.
Font.registerHyphenationCallback((word) => [word]);

export interface InvoicePdfData {
  /** Series and number, e.g. F2026-0001. */
  number: string;
  issueDate: string;
  snapshot: InvoiceSnapshot;
  /** The QR tributario as the connector drew it. */
  qrPng: Buffer;
  logo: { data: Buffer; format: 'png' | 'jpg' } | null;
}

const INK = '#1a1f2b';
const MUTED = '#5b6372';
const RULE = '#d9dde5';

const styles = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9, color: INK, padding: '14mm', paddingBottom: '20mm', lineHeight: 1.35 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logo: { maxHeight: 44, maxWidth: 160, objectFit: 'contain', marginBottom: 8 },
  partyName: { fontSize: 11, fontWeight: 600, marginBottom: 2 },
  qr: { alignItems: 'center', marginBottom: 6 },
  qrCaption: { fontSize: 10, fontWeight: 600 },
  // 35 mm, inside a white margin of 3 mm: the quiet zone.
  qrImage: { width: '35mm', height: '35mm', margin: '3mm' },
  title: { marginBottom: 10 },
  h1: { fontSize: 20, fontWeight: 600 },
  kv: { flexDirection: 'row', gap: 8 },
  kvLabel: { width: 100, color: MUTED },
  eyebrow: { fontSize: 7.5, fontWeight: 600, color: MUTED, textTransform: 'uppercase', marginBottom: 3 },
  recipient: { borderTop: `1pt solid ${RULE}`, borderBottom: `1pt solid ${RULE}`, paddingVertical: 10, marginBottom: 12 },
  description: { marginBottom: 10 },
  row: { flexDirection: 'row', borderBottom: `0.5pt solid ${RULE}`, paddingVertical: 5 },
  headRow: { flexDirection: 'row', borderBottom: `1pt solid ${INK}`, paddingBottom: 4, fontWeight: 600, color: MUTED, fontSize: 8 },
  concept: { flex: 1, paddingRight: 8 },
  quantity: { width: 50, textAlign: 'right' },
  price: { width: 70, textAlign: 'right' },
  discount: { width: 40, textAlign: 'right' },
  vat: { width: 45, paddingLeft: 10 },
  amount: { width: 75, textAlign: 'right' },
  totals: { flexDirection: 'row', justifyContent: 'space-between', gap: 24, marginTop: 14 },
  mentions: { flex: 1, gap: 6, fontSize: 8, color: MUTED },
  sums: { width: 230 },
  sum: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  strong: { fontWeight: 600 },
  due: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#eef1f6',
    fontSize: 12,
    fontWeight: 600,
  },
  footer: { position: 'absolute', bottom: '10mm', left: '14mm', right: '14mm', fontSize: 7.5, color: MUTED, textAlign: 'right' },
});

/** "2340.5" → "2340,5". */
const decimal = (value: string) => value.replace('.', ',');

function Sum({ label, amount, strong = false }: { label: string; amount: string; strong?: boolean }) {
  return (
    <View style={[styles.sum, strong ? styles.strong : {}]}>
      <Text>{label}</Text>
      <Text>{amount}</Text>
    </View>
  );
}

/** Who issues or receives the invoice: name, tax ID and address. */
function Party({ party }: { party: InvoiceSnapshot['recipient'] }) {
  return (
    <>
      <Text style={styles.partyName}>{party.name}</Text>
      <Text>NIF {party.taxId}</Text>
      <Text>{party.address}</Text>
      <Text>
        {party.postalCode} {party.municipality} ({party.province})
      </Text>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text>{children}</Text>
    </View>
  );
}

export function InvoicePdf({ number, issueDate, snapshot, qrPng, logo }: InvoicePdfData) {
  const { issuer, recipient, billingPeriod, operationDate, breakdown } = snapshot;
  return (
    <Document title={`Factura ${number}`} author={issuer.name} language="es">
      <Page size="A4" style={styles.page}>
        <View style={styles.qr}>
          <Text style={styles.qrCaption}>QR tributario:</Text>
          <Image style={styles.qrImage} src={{ data: qrPng, format: 'png' }} />
          <Text style={styles.qrCaption}>VERI*FACTU</Text>
        </View>

        <View style={styles.head}>
          <View>
            {logo && <Image style={styles.logo} src={logo} />}
            <Party party={issuer} />
            {issuer.email && <Text>{issuer.email}</Text>}
            {issuer.phone && <Text>{issuer.phone}</Text>}
          </View>
          <View>
            <Field label="Fecha de expedición">{formatSpanishDate(issueDate)}</Field>
            {billingPeriod && (
              <Field label="Periodo facturado">
                {formatSpanishDate(billingPeriod.start)} – {formatSpanishDate(billingPeriod.end)}
              </Field>
            )}
            {operationDate && operationDate !== issueDate && (
              <Field label="Fecha de operación">{formatSpanishDate(operationDate)}</Field>
            )}
          </View>
        </View>

        <Text style={[styles.h1, styles.title]}>Factura {number}</Text>

        <View style={styles.recipient}>
          <Text style={styles.eyebrow}>Facturar a</Text>
          <Party party={recipient} />
        </View>

        {snapshot.operationDescription && <Text style={styles.description}>{snapshot.operationDescription}</Text>}

        <View style={styles.headRow} fixed>
          <Text style={styles.concept}>Concepto</Text>
          <Text style={styles.quantity}>Cantidad</Text>
          <Text style={styles.price}>Precio unit.</Text>
          <Text style={styles.discount}>Dto.</Text>
          <Text style={styles.vat}>IVA</Text>
          <Text style={styles.amount}>Importe</Text>
        </View>
        {snapshot.lines.map((line, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.concept}>{line.concept}</Text>
            <Text style={styles.quantity}>{decimal(line.quantity)}</Text>
            <Text style={styles.price}>{formatAmount(line.unitPrice)}</Text>
            <Text style={styles.discount}>{line.discountPercent ? `${decimal(line.discountPercent)} %` : '—'}</Text>
            <Text style={styles.vat}>{line.vat.kind === 'exempt' ? 'Exenta' : `${line.vat.rate} %`}</Text>
            <Text style={styles.amount}>{formatAmount(breakdown.lines[i]!.base)}</Text>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.mentions}>
            {breakdown.exempt.map(({ ground, mention }) => (
              <Text key={ground}>
                {exemptionGround(ground).label}: {mention}
              </Text>
            ))}
            {issuer.iban && <Text>Forma de pago: transferencia a {formatIban(issuer.iban)}</Text>}
          </View>
          <View style={styles.sums}>
            <Sum label="Base imponible" amount={formatAmount(breakdown.taxBase)} />
            {breakdown.taxed.map(({ rate, base, taxAmount }) => (
              <View key={rate}>
                <Sum label={`Base imponible ${rate} %`} amount={formatAmount(base)} />
                <Sum label={`Cuota IVA ${rate} %`} amount={formatAmount(taxAmount)} />
              </View>
            ))}
            {breakdown.exempt.map(({ ground, base }) => (
              <Sum key={ground} label="Base exenta" amount={formatAmount(base)} />
            ))}
            <Sum label="Importe total" amount={formatAmount(breakdown.totalAmount)} strong />
            <Sum
              label={`Retención de IRPF (${breakdown.withholding.rate} %)`}
              amount={formatWithheld(breakdown.withholding.amount)}
            />
            <View style={styles.due}>
              <Text>Total a pagar</Text>
              <Text>{formatAmount(breakdown.amountDue)}</Text>
            </View>
          </View>
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `Factura ${number} · Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf {...data} />);
}
