import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  formatSpanishDate,
  INVOICE_LIST_FILTERS,
  type InvoiceIncident,
  type InvoiceListFilter,
  type InvoiceListItem,
} from '@verifiq/domain';
import { useDeferredValue, useState, type KeyboardEvent } from 'react';
import { fetchInvoiceIncidents, fetchInvoiceList } from '../api';
import { formatAmount } from '../format';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { Alert } from '../ui/components';
import { Icon } from '../ui/icons';
import { InvoiceStates, RecordState } from '../ui/InvoiceStates';

const FILTER_LABELS: Record<InvoiceListFilter, string> = {
  all: 'Todas',
  drafts: 'Borradores',
  pending: 'Pendientes',
  accepted: 'Aceptadas',
  incidents: 'Con incidencias',
  rectified: 'Rectificadas',
  voided: 'Anuladas',
};

/** "Facturas": every draft and invoice, newest first, with the incidents to resolve on top. */
export function HomePage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InvoiceListFilter>('all');
  const q = useDeferredValue(search.trim());
  const list = useInfiniteQuery({
    queryKey: ['invoices', 'list', filter, q],
    queryFn: ({ pageParam }) => fetchInvoiceList({ q, filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const incidents = useQuery({ queryKey: ['invoices', 'incidents'], queryFn: fetchInvoiceIncidents, retry: false });
  useSessionExpiry(list.error ?? incidents.error);

  const counts = list.data?.pages[0]?.counts;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  // Nothing at all yet, not just nothing matching.
  const firstUse = counts?.all === 0 && q === '';

  return (
    <AppShell>
      <div className="page-head">
        <h1 className="h1">Facturas</h1>
      </div>

      {list.isError && <Alert tone="danger">No se han podido cargar tus facturas. Recarga la página.</Alert>}
      {list.isPending && <p>Cargando…</p>}
      {firstUse && <FirstUse />}

      {counts && !firstUse && (
        <>
          {incidents.data && incidents.data.length > 0 && <Incidents incidents={incidents.data} />}

          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
            <label className="affix" style={{ width: 360, maxWidth: '100%' }}>
              <span className="sr-only">Buscar facturas</span>
              <Icon name="search" />
              <input
                className="input"
                type="search"
                placeholder="Buscar por número, cliente o importe"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="pills" role="group" aria-label="Filtrar por estado">
              {INVOICE_LIST_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="pill"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {FILTER_LABELS[value]}
                  <span className={value === 'incidents' && counts[value] > 0 ? 'c alarm' : 'c'}>{counts[value]}</span>
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="card" style={{ padding: 24 }}>
              <p className="muted">
                {q ? 'Ninguna factura coincide con la búsqueda.' : 'No hay facturas en este estado.'}
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>Número</th>
                    <th style={{ width: 120 }}>Fecha</th>
                    <th>Cliente</th>
                    <th className="r" style={{ width: 150 }}>
                      Importe total
                    </th>
                    <th className="r" style={{ width: 150 }}>
                      Total a pagar
                    </th>
                    <th style={{ width: 290 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <ListRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderTop: '1px solid var(--line)',
                  background: 'var(--surface-2)',
                }}
              >
                <span className="small muted">
                  Mostrando {items.length} de {counts[filter]}
                </span>
                {list.hasNextPage && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

/** A row that opens the draft's editor or the invoice's detail, clicked anywhere or with Enter. */
function ListRow({ item }: { item: InvoiceListItem }) {
  const navigate = useNavigate();
  const open = () =>
    item.kind === 'draft'
      ? navigate({ to: '/drafts/$draftId', params: { draftId: item.id } })
      : navigate({ to: '/invoices/$invoiceId', params: { invoiceId: item.id } });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    void open();
  };
  const voided = item.kind === 'invoice' && item.status === 'voided';

  return (
    <tr
      className={voided ? 'row-link is-void' : 'row-link'}
      tabIndex={0}
      onClick={() => void open()}
      onKeyDown={onKeyDown}
    >
      <td>
        {item.kind === 'draft' ? (
          <span className="muted" style={{ fontStyle: 'italic' }}>
            Sin número
          </span>
        ) : (
          <span className="lnk mono">{item.number}</span>
        )}
        {item.corrects && <div className="xs muted">Rectifica {item.corrects}</div>}
      </td>
      <td className="num">{formatSpanishDate(item.date)}</td>
      <td>{item.recipientName ?? <span className="muted">Sin cliente</span>}</td>
      <td className="r num amt">{formatAmount(item.totalAmount)}</td>
      <td className="r num amt" style={voided ? undefined : { fontWeight: 600 }}>
        {formatAmount(item.amountDue)}
      </td>
      <td>
        {item.kind === 'draft' ? (
          <div className="states">
            <span className="sf sf-draft">Borrador</span>
          </div>
        ) : (
          <InvoiceStates status={item.status} recordStatus={item.recordStatus} unconfirmed={item.unconfirmed} />
        )}
      </td>
    </tr>
  );
}

/** What went wrong with the record, and what to do about it. */
function incidentCopy(incident: InvoiceIncident): { text: string; action: string; primary: boolean } {
  if (incident.unconfirmed) {
    return {
      text: 'Hacienda aún no ha confirmado el registro pasadas 24 horas. Seguimos consultándolo y el equipo de Verifiq ya está avisado.',
      action: 'Ver estado',
      primary: false,
    };
  }
  const reason = incident.message ? ` ${incident.message}` : '';
  switch (incident.recordStatus) {
    case 'blocked':
      return { text: `No se ha podido enviar a Hacienda.${reason}`, action: 'Corregir y reintentar', primary: true };
    case 'rejected':
      return { text: `Hacienda la ha rechazado.${reason}`, action: 'Corregir y reenviar', primary: true };
    default:
      return { text: `Registrada, pero con errores.${reason}`, action: 'Revisar', primary: false };
  }
}

/** The invoices Hacienda does not have right, above the list. */
function Incidents({ incidents }: { incidents: InvoiceIncident[] }) {
  const count = incidents.length;
  return (
    <section
      className="card"
      aria-label="Incidencias"
      style={{ borderColor: 'var(--danger-line)', overflow: 'hidden', marginBottom: 28 }}
    >
      <div
        className="row"
        style={{
          gap: 12,
          padding: '14px 20px',
          background: 'var(--danger-soft)',
          borderBottom: '1px solid var(--danger-line)',
          color: 'var(--danger-ink)',
        }}
      >
        <Icon name="alert" />
        <b>{count === 1 ? '1 factura necesita tu atención' : `${count} facturas necesitan tu atención`}</b>
        <span className="small">Hacienda no las tiene registradas correctamente hasta que lo resuelvas.</span>
      </div>
      {incidents.map((incident, index) => {
        const { text, action, primary } = incidentCopy(incident);
        return (
          <div
            key={incident.id}
            className="incident"
            style={{ borderBottom: index < count - 1 ? '1px solid var(--line)' : undefined }}
          >
            <div>
              <Link to="/invoices/$invoiceId" params={{ invoiceId: incident.id }} className="lnk mono">
                {incident.number}
              </Link>
              <div className="xs muted">{incident.recipientName}</div>
            </div>
            <div>
              <RecordState status={incident.recordStatus} unconfirmed={incident.unconfirmed} />
            </div>
            <p className="small">{text}</p>
            <Link
              to="/invoices/$invoiceId"
              params={{ invoiceId: incident.id }}
              className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'}`}
            >
              {action}
            </Link>
          </div>
        );
      })}
    </section>
  );
}

/** No drafts or invoices yet: where to start. */
function FirstUse() {
  return (
    <div
      className="card"
      style={{ padding: '72px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'var(--primary-soft)',
          color: 'var(--primary)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Icon name="file" />
      </div>
      <div className="stack" style={{ gap: 6, maxWidth: 520 }}>
        <h2 className="h2">Todavía no tienes facturas</h2>
        <p className="ink2">
          Empieza añadiendo las clínicas a las que facturas y los conceptos que repites cada mes. Así cada factura nueva
          se rellena en un par de minutos.
        </p>
      </div>
      <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
        <Link to="/drafts/new" className="btn btn-primary">
          <Icon name="plus" />
          Nueva factura
        </Link>
        <Link to="/recipients/new" className="btn btn-secondary">
          Añadir un cliente
        </Link>
        <Link to="/catalog-items/new" className="btn btn-ghost">
          Crear artículos
        </Link>
      </div>
    </div>
  );
}
