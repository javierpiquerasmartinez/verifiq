import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  INVITATION_LIST_FILTERS,
  type InvitationListFilter,
  type InvitationListSort,
  type InvitationStatus,
  type OperatorInvitation,
} from '@verifiq/domain';
import { useDeferredValue, useEffect, useState } from 'react';
import { fetchOperatorInvitations, revokeOperatorInvitation } from '../api';
import { formatDateTime } from '../format';
import { nextSort, type InvitationsSearch } from '../operator-invitations';
import { useSessionExpiry } from '../session';
import { Alert } from '../ui/components';
import { Icon } from '../ui/icons';
import { NoBusinessData, OperatorShell } from './Operator';

const FILTER_LABELS: Record<InvitationListFilter, string> = {
  all: 'Todas',
  pending: 'Pendientes',
  accepted: 'Aceptadas',
  expired: 'Caducadas',
  revoked: 'Revocadas',
};

const STATUS_TAGS: Record<InvitationStatus, { label: string; tone: string }> = {
  pending: { label: 'Pendiente', tone: 'info' },
  accepted: { label: 'Aceptada', tone: 'ok' },
  expired: { label: 'Caducada', tone: 'warn' },
  revoked: { label: 'Revocada', tone: 'neutral' },
};

/**
 * Every invitation the operator sent, whatever became of it, to look into what happened to one. Only
 * the invitation and who it let in: nothing of the issuers' business (story 93).
 */
export function OperatorInvitationsPage() {
  const view = useSearch({ from: '/operator/invitations' });
  const navigate = useNavigate({ from: '/operator/invitations' });
  const queryClient = useQueryClient();
  // Typed here, then kept in the URL once the typing settles.
  const [search, setSearch] = useState(view.q);
  const q = useDeferredValue(search.trim());
  const update = (change: Partial<InvitationsSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }), replace: true });
  useEffect(() => {
    if (q !== view.q) update({ q });
    // Only when the search changes; the URL follows it.
  }, [q]);

  const list = useInfiniteQuery({
    queryKey: ['operator', 'invitations', 'list', q, view.status, view.sort, view.order],
    queryFn: ({ pageParam }) =>
      fetchOperatorInvitations({ q, status: view.status, sort: view.sort, order: view.order, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: revokeOperatorInvitation,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['operator', 'invitations'] }),
  });
  useSessionExpiry(list.error);

  function confirmRevoke(invitation: OperatorInvitation) {
    if (window.confirm(`¿Revocar la invitación de ${invitation.email}? Su enlace dejará de funcionar.`)) {
      revoke.mutate(invitation.id);
    }
  }

  const counts = list.data?.pages[0]?.counts;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <OperatorShell>
      <div>
        <nav className="crumb" aria-label="Ruta">
          <Link to="/operator">Panel</Link>
          <Icon name="chevronRight" size="xs" />
          <span>Invitaciones</span>
        </nav>
        <h1 className="h1">Invitaciones</h1>
      </div>
      <NoBusinessData />

      {list.isError && <Alert tone="danger">No se han podido cargar las invitaciones. Recarga la página.</Alert>}
      {revoke.isError && <Alert tone="danger">No se ha podido revocar la invitación. Puede que ya se haya usado.</Alert>}
      {list.isPending && <p>Cargando…</p>}

      {counts && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <label className="affix" style={{ width: 360, maxWidth: '100%' }}>
              <span className="sr-only">Buscar invitaciones</span>
              <Icon name="search" />
              <input
                className="input"
                type="search"
                placeholder="Buscar por email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="pills" role="group" aria-label="Filtrar por estado">
              {INVITATION_LIST_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="pill"
                  aria-pressed={view.status === value}
                  onClick={() => update({ status: value })}
                >
                  {FILTER_LABELS[value]}
                  <span className="c">{counts[value]}</span>
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="card" style={{ padding: 24 }}>
              <p className="muted">
                {q ? 'Ninguna invitación coincide con la búsqueda.' : 'No hay invitaciones en este estado.'}
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ minWidth: 960 }}>
                  <thead>
                    <tr>
                      <SortHeader column="email" view={view} onSort={update}>
                        Email
                      </SortHeader>
                      <th style={{ width: 110 }}>Estado</th>
                      <SortHeader column="sent" view={view} onSort={update} width={150}>
                        Enviada
                      </SortHeader>
                      <SortHeader column="expires" view={view} onSort={update} width={150}>
                        Caduca
                      </SortHeader>
                      <th style={{ width: 150 }}>Aceptada o revocada</th>
                      <th>Emisor</th>
                      <th style={{ width: 100 }}>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((invitation) => (
                      <tr key={invitation.id}>
                        <td style={{ overflowWrap: 'anywhere' }}>{invitation.email}</td>
                        <td>
                          <span className={`tag tag-${STATUS_TAGS[invitation.status].tone}`}>
                            {STATUS_TAGS[invitation.status].label}
                          </span>
                        </td>
                        <td className="small num">{formatDateTime(invitation.createdAt)}</td>
                        <td className="small num">{formatDateTime(invitation.expiresAt)}</td>
                        <td className="small num">
                          {invitation.acceptedAt
                            ? formatDateTime(invitation.acceptedAt)
                            : invitation.revokedAt
                              ? formatDateTime(invitation.revokedAt)
                              : <span className="muted">—</span>}
                        </td>
                        <td>
                          {invitation.issuer ? (
                            <>
                              {invitation.issuer.name}
                              <div className="xs muted mono">{invitation.issuer.taxId}</div>
                            </>
                          ) : invitation.status === 'accepted' ? (
                            <span className="muted small">Alta sin completar</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="r">
                          {invitation.status === 'pending' && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={revoke.isPending}
                              onClick={() => confirmRevoke(invitation)}
                            >
                              Revocar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  Mostrando {items.length} de {counts[view.status]}
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
        </div>
      )}
    </OperatorShell>
  );
}

/** A column header that sorts the list by it, or the other way round when it already does. */
function SortHeader({
  column,
  view,
  onSort,
  width,
  children,
}: {
  column: InvitationListSort;
  view: InvitationsSearch;
  onSort: (change: Partial<InvitationsSearch>) => void;
  width?: number;
  children: string;
}) {
  const sorted = view.sort === column;
  return (
    <th style={width ? { width } : undefined} aria-sort={sorted ? (view.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => onSort(nextSort(view, column))}>
        {children}
        <span aria-hidden="true">{sorted ? (view.order === 'asc' ? ' ↑' : ' ↓') : ''}</span>
      </button>
    </th>
  );
}
