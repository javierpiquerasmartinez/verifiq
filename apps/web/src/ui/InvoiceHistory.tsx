import { Link } from '@tanstack/react-router';
import type { InvoiceEvent, InvoiceHistoryEntry } from '@verifiq/domain';
import { formatDateTime } from '../format';
import { Icon, type IconName } from './icons';

const EVENTS: Record<InvoiceEvent, { label: string; icon: IconName; tone?: 'ok' | 'warn' | 'danger' | 'rect' }> = {
  issued: { label: 'Emitida', icon: 'lock' },
  submitted: { label: 'Enviada a la AEAT', icon: 'arrowRight' },
  blocked: { label: 'No se pudo enviar a la AEAT', icon: 'closeSmall', tone: 'danger' },
  'pdf-generated': { label: 'PDF generado', icon: 'file' },
  accepted: { label: 'Aceptada por la AEAT', icon: 'check', tone: 'ok' },
  'accepted-with-errors': { label: 'Aceptada con errores por la AEAT', icon: 'mark', tone: 'warn' },
  rejected: { label: 'Rechazada por la AEAT', icon: 'closeSmall', tone: 'danger' },
  resubmitted: { label: 'Corregida y reenviada', icon: 'arrowRight' },
  rectified: { label: 'Rectificada por', icon: 'rectify', tone: 'rect' },
};

/** The invoice's timeline, newest first: what happened, when, and who did it («Sistema» if no one did). */
export function InvoiceHistory({ history }: { history: InvoiceHistoryEntry[] }) {
  return (
    <section className="card card-pad stack" style={{ gap: 18 }} aria-labelledby="invoice-history">
      <h2 className="h3" id="invoice-history">
        Historial
      </h2>
      <ol className="tl">
        {[...history].reverse().map((entry, index) => {
          const event = EVENTS[entry.event];
          return (
            <li key={`${entry.occurredAt}-${index}`}>
              <span className={['dot', event.tone].filter(Boolean).join(' ')}>
                <Icon name={event.icon} size="xs" />
              </span>
              <div>
                <p className="tl-t">
                  {event.label}
                  {entry.invoice && (
                    <>
                      {' '}
                      <Link to="/invoices/$invoiceId" params={{ invoiceId: entry.invoice.id }} className="lnk mono">
                        {entry.invoice.number}
                      </Link>
                    </>
                  )}
                </p>
                <p className="tl-m">
                  {formatDateTime(entry.occurredAt)} · {entry.actor ?? 'Sistema'}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
