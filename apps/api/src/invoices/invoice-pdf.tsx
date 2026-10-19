import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import {
  correctionReasonLabel,
  formatAmount,
  formatIban,
  formatSpanishDate,
  formatWithheld,
  type InvoiceSnapshot,
} from '@verifiq/domain';
import { createRequire } from 'node:module';

// The PDF of an issued invoice, drawn from its frozen copy and laid out as the design's A4 sheet, whose CSS
// pixels are PDF points: the sheet is 595 wide. Its content is the one the Reglamento de facturación
// requires; the QR tributario opens the first page, as the VeriFactu order (HAC/1177/2024) asks: 30–40 mm,
// with a quiet zone, "QR tributario:" above and "VERI*FACTU" below in type no smaller than the invoice's
// data, so its captions keep the body size where the design draws them smaller.

const require = createRequire(import.meta.url);
const FONT = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';
Font.register({
  family: FONT,
  fonts: [
    { src: require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff') },
    { src: require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff'), fontWeight: 600 },
    { src: require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff'), fontWeight: 700 },
  ],
});
// IBM's own files: fontkit cannot read Fontsource's subset of IBM Plex Mono.
Font.register({
  family: MONO,
  fonts: [
    { src: require.resolve('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff') },
    { src: require.resolve('@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-SemiBold.woff'), fontWeight: 600 },
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

const INK = '#111';
const SECONDARY = '#444';
const LABEL = '#555';
const RULE = '#ddd';
const GAP = 18;
// react-pdf inherits the line height in points: text larger than the body sets its own.
const LINE_HEIGHT = 1.45;

const styles = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9.5, lineHeight: LINE_HEIGHT, color: INK, paddingVertical: 34, paddingHorizontal: 38 },
  mono: { fontFamily: MONO },
  strong: { fontWeight: 600 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: GAP },
  qr: { alignItems: 'center', padding: 4 },
  qrCaption: { fontWeight: 600 },
  // 92 pt is 32.5 mm, inside a white margin of 2 mm: the quiet zone.
  qrImage: { width: 92, height: 92, margin: '2mm' },
  title: { alignItems: 'flex-end', textAlign: 'right' },
  logo: { maxHeight: 40, maxWidth: 140, objectFit: 'contain', marginBottom: 6 },
  h1: { fontSize: 18, lineHeight: LINE_HEIGHT, fontWeight: 600 },
  number: { fontFamily: MONO, fontSize: 11, lineHeight: LINE_HEIGHT },
  parties: { flexDirection: 'row', gap: 20, marginBottom: GAP },
  party: { flex: 1 },
  eyebrow: { fontSize: 7.5, fontWeight: 600, letterSpacing: 0.6, color: LABEL },
  description: { marginBottom: GAP },
  correction: { marginBottom: GAP, padding: 8, border: `1pt solid ${RULE}` },
  row: { flexDirection: 'row', gap: 6, paddingVertical: 5, borderBottom: `1pt solid ${RULE}` },
  headRow: { borderBottomColor: INK, fontSize: 8, fontWeight: 600 },
  concept: { flex: 1 },
  quantity: { width: 40, textAlign: 'right' },
  price: { width: 70, textAlign: 'right' },
  discount: { width: 40, textAlign: 'right' },
  vat: { width: 50 },
  amount: { width: 70, textAlign: 'right' },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginTop: GAP },
  mentions: { maxWidth: 220, gap: 4, fontSize: 8, color: SECONDARY },
  sums: { width: 220, gap: 3 },
  rateSums: { gap: 3 },
  sum: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  due: { fontSize: 11, lineHeight: LINE_HEIGHT, fontWeight: 700, borderTop: `1pt solid ${INK}`, paddingTop: 4 },
  // At the foot of the sheet, wherever the totals end.
  payment: { marginTop: 'auto', fontSize: 8, color: SECONDARY, borderTop: `1pt solid ${RULE}`, paddingTop: 8 },
  pageNumber: { position: 'absolute', bottom: 14, left: 38, right: 38, fontSize: 7.5, color: SECONDARY, textAlign: 'right' },
});

/** "2340.5" → "2340,5". */
const decimal = (value: string) => value.replace('.', ',');

/** An amount in the lines' table, where the € goes without saying. */
const amountWithoutCurrency = (amount: string) => formatAmount(amount).replace(/\s*€$/, '');

function Sum({ label, amount, style }: { label: string; amount: string; style?: (typeof styles)[keyof typeof styles] }) {
  return (
    <View style={[styles.sum, style ?? {}]}>
      <Text>{label}</Text>
      <Text>{amount}</Text>
    </View>
  );
}

/** Who issues or receives the invoice: name, tax ID and address. */
function Party({ heading, party }: { heading: string; party: InvoiceSnapshot['recipient'] }) {
  return (
    <View style={styles.party}>
      <Text style={styles.eyebrow}>{heading}</Text>
      <Text style={styles.strong}>{party.name}</Text>
      <Text>NIF {party.taxId}</Text>
      <Text>
        {party.address} · {party.postalCode} {party.municipality}
      </Text>
    </View>
  );
}

export function InvoicePdf({ number, issueDate, snapshot, qrPng, logo }: InvoicePdfData) {
  const { issuer, recipient, billingPeriod, operationDate, breakdown } = snapshot;
  // Copies issued before corrective invoices existed have no correction.
  const correction = snapshot.correction ?? null;
  const title = correction ? 'Factura rectificativa' : 'Factura';
  return (
    <Document title={`${title} ${number}`} author={issuer.name} language="es">
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <View style={styles.qr}>
            <Text style={styles.qrCaption}>QR tributario:</Text>
            <Image style={styles.qrImage} src={{ data: qrPng, format: 'png' }} />
            <Text style={[styles.qrCaption, styles.mono]}>VERI*FACTU</Text>
          </View>
          <View style={styles.title}>
            {logo && <Image style={styles.logo} src={logo} />}
            <Text style={styles.h1}>{title}</Text>
            <Text style={styles.number}>{number}</Text>
            <Text>Fecha de expedición: {formatSpanishDate(issueDate)}</Text>
            {billingPeriod && (
              <Text>
                Periodo: {formatSpanishDate(billingPeriod.start)} – {formatSpanishDate(billingPeriod.end)}
              </Text>
            )}
            {operationDate && operationDate !== issueDate && (
              <Text>Fecha de operación: {formatSpanishDate(operationDate)}</Text>
            )}
          </View>
        </View>

        <View style={styles.parties}>
          <Party heading="EMISOR" party={issuer} />
          <Party heading="CLIENTE" party={recipient} />
        </View>

        {correction && (
          <View style={styles.correction} wrap={false}>
            <Text style={styles.strong}>
              Rectifica la factura <Text style={styles.mono}>{correction.invoice.number}</Text> de{' '}
              {formatSpanishDate(correction.invoice.issueDate)}
            </Text>
            <Text>
              Motivo: {correctionReasonLabel(correction.reason)}. {correction.note}
            </Text>
          </View>
        )}

        {snapshot.operationDescription && <Text style={styles.description}>{snapshot.operationDescription}</Text>}

        <View style={[styles.row, styles.headRow]} fixed>
          <Text style={styles.concept}>Concepto</Text>
          <Text style={styles.quantity}>Cant.</Text>
          <Text style={styles.price}>Precio</Text>
          <Text style={styles.discount}>Dto.</Text>
          <Text style={styles.vat}>IVA</Text>
          <Text style={styles.amount}>Importe</Text>
        </View>
        {snapshot.lines.map((line, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.concept}>{line.concept}</Text>
            <Text style={styles.quantity}>{decimal(line.quantity)}</Text>
            <Text style={styles.price}>{amountWithoutCurrency(line.unitPrice)}</Text>
            <Text style={styles.discount}>{line.discountPercent ? `${decimal(line.discountPercent)} %` : '—'}</Text>
            <Text style={styles.vat}>{line.vat.kind === 'exempt' ? 'Exenta' : `${line.vat.rate} %`}</Text>
            <Text style={styles.amount}>{amountWithoutCurrency(breakdown.lines[i]!.base)}</Text>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.mentions}>
            {breakdown.exempt.map(({ ground, mention }) => (
              <Text key={ground}>{mention}</Text>
            ))}
          </View>
          <View style={styles.sums}>
            {breakdown.taxed.map(({ rate, base, taxAmount }) => (
              <View key={rate} style={styles.rateSums}>
                <Sum label={`Base imponible (${rate} %)`} amount={formatAmount(base)} />
                <Sum label={`Cuota IVA (${rate} %)`} amount={formatAmount(taxAmount)} />
              </View>
            ))}
            {breakdown.exempt.map(({ ground, base }) => (
              <Sum key={ground} label="Base imponible (exenta)" amount={formatAmount(base)} />
            ))}
            <Sum label="Importe total" amount={formatAmount(breakdown.totalAmount)} style={styles.strong} />
            <Sum
              label={`Retención IRPF (${breakdown.withholding.rate} %)`}
              amount={formatWithheld(breakdown.withholding.amount)}
            />
            <Sum label="Total a pagar" amount={formatAmount(breakdown.amountDue)} style={styles.due} />
          </View>
        </View>

        {issuer.iban && (
          <Text style={styles.payment} wrap={false}>
            Forma de pago: transferencia a <Text style={styles.mono}>{formatIban(issuer.iban)}</Text>
          </Text>
        )}

        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${title} ${number} · Página ${pageNumber} de ${totalPages}` : '')}
        />
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf {...data} />);
}
