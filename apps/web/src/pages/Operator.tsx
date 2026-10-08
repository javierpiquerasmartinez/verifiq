import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type {
  CreatedInvitation,
  OperatorInvitation,
  OperatorIssuer,
  RecordAlertKind,
  RepresentationError,
  RepresentationState,
} from '@verifiq/domain';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ApiError,
  createOperatorInvitation,
  fetchOperatorInvitations,
  fetchOperatorIssuers,
  fetchRecordAlerts,
  revokeOperatorInvitation,
} from '../api';
import { authClient } from '../auth-client';
import { formatDate, formatDateTime } from '../format';
import { alertGroups, panelRows, type AlertGroup } from '../operator-panel';
import { useSessionExpiry } from '../session';
import { Alert, Field } from '../ui/components';
import { BrandMark, Icon } from '../ui/icons';

/**
 * The operator's panel: who to let in, and the operational health of every issuer. It never shows
 * an issuer's invoices or recipients (spec, story 93).
 */
export function OperatorPage() {
  const issuers = useQuery({ queryKey: ['operator', 'issuers'], queryFn: fetchOperatorIssuers, retry: false });
  const alerts = useQuery({ queryKey: ['operator', 'alerts'], queryFn: fetchRecordAlerts, retry: false });
  const invitations = useQuery({ queryKey: ['operator', 'invitations'], queryFn: fetchOperatorInvitations, retry: false });
  useSessionExpiry(issuers.error ?? alerts.error ?? invitations.error);

  return (
    <OperatorShell>
      <h1 className="sr-only">Panel del operador</h1>
      <div className="alert alert-neutral" style={{ padding: '12px 16px' }}>
        <Icon name="shield" />
        <p className="small">Este panel nunca muestra facturas ni datos de los clientes de los Emisores.</p>
      </div>
      <div className="row" style={{ gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <section className="card" style={{ flex: '1 1 560px', minWidth: 0, overflow: 'hidden' }} aria-labelledby="alerts">
          <div className="card-head">
            <h2 className="h3" id="alerts">
              Alertas de registro
            </h2>
            {alerts.data && <OpenAlerts count={alertGroups(alerts.data).length} />}
          </div>
          {alerts.isError && (
            <div className="card-pad">
              <Alert tone="danger">No se han podido cargar las alertas. Recarga la página.</Alert>
            </div>
          )}
          {alerts.data && <Alerts groups={alertGroups(alerts.data)} />}
        </section>
        <NewInvitation />
      </div>
      <Issuers issuers={issuers} invitations={invitations} />
    </OperatorShell>
  );
}

function OperatorShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const session = authClient.useSession();

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/sign-in' });
  }

  return (
    <div className="app">
      <header className="topbar topbar-admin">
        <div className="topbar-in">
          <span className="brand">
            <BrandMark inverted />
            Verifiq
            <span className="tag" style={{ marginLeft: 6 }}>
              Administración
            </span>
          </span>
          <div className="who">
            {session.data && <span className="small">Operador · {session.data.user.email}</span>}
            <button type="button" className="btn btn-ghost" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="page stack" style={{ gap: 28 }}>
        {children}
      </main>
    </div>
  );
}

/** The `tag-*` styles. */
type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

function OpenAlerts({ count }: { count: number }) {
  if (count === 0) return <span className="tag tag-ok">Ninguna abierta</span>;
  return <span className="tag tag-danger">{count === 1 ? '1 abierta' : `${count} abiertas`}</span>;
}

/** The problem, as the record's pill at the AEAT says it (`sr-*` styles). */
const ALERT_PROBLEMS: Record<RecordAlertKind, { tone: string; label: (count: number) => string }> = {
  rejected: { tone: 'blocked', label: (count) => (count === 1 ? '1 rechazada' : `${count} rechazadas`) },
  blocked: { tone: 'blocked', label: (count) => (count === 1 ? '1 bloqueada' : `${count} bloqueadas`) },
  unconfirmed: { tone: 'warn', label: (count) => `${count} sin confirmar > 24 h` },
};

function Alerts({ groups }: { groups: AlertGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="muted card-pad">Ningún registro rechazado, bloqueado ni sin confirmar.</p>
    );
  }
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Emisor</th>
          <th>Problema</th>
          <th style={{ width: 170 }}>Desde</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const { tone, label } = ALERT_PROBLEMS[group.kind];
          return (
            <tr key={`${group.issuer.id}:${group.kind}`}>
              <td>
                {group.issuer.name}
                <div className="xs muted mono">{group.issuer.taxId}</div>
              </td>
              <td>
                <span className={`sr sr-${tone}`}>
                  <span className="sr-k">AEAT</span>
                  <span className="sr-v">{label(group.records.length)}</span>
                </span>
                {/* To talk about them with the user: the numbers and error codes, nothing of their content. */}
                <div className="xs muted mono" style={{ marginTop: 4 }}>
                  {group.records
                    .map(({ invoiceNumber, errorCode }) => (errorCode ? `${invoiceNumber} (${errorCode})` : invoiceNumber))
                    .join(', ')}
                </div>
              </td>
              <td className="small num">{formatDateTime(group.since)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const REPRESENTATION_LABELS: Record<Exclude<RepresentationState, 'error'>, { label: string; tone: Tone }> = {
  'not-required': { label: 'No necesaria', tone: 'neutral' },
  'not-started': { label: 'Sin firmar', tone: 'neutral' },
  pending: { label: 'Pendiente de firma', tone: 'warn' },
  signed: { label: 'Firmada', tone: 'ok' },
};

const REPRESENTATION_ERROR_LABELS: Record<RepresentationError, string> = {
  rejected: 'Firma rechazada',
  expired: 'Firma caducada',
  cancelled: 'Cancelada',
  'issuer-not-accepted': 'NIF no aceptado',
};

function RepresentationTag({ representation }: { representation: OperatorIssuer['representation'] }) {
  const { label, tone }: { label: string; tone: Tone } =
    representation.state === 'error'
      ? { label: representation.error ? REPRESENTATION_ERROR_LABELS[representation.error] : 'Error', tone: 'danger' }
      : REPRESENTATION_LABELS[representation.state];
  return <span className={`tag tag-${tone}`}>{label}</span>;
}

const INVITATION_LABELS: Partial<Record<OperatorInvitation['status'], string>> = {
  pending: 'Invitación enviada',
  expired: 'Invitación caducada',
};

/** The issuers, and below them whom the operator invited and has not joined yet. */
function Issuers({
  issuers,
  invitations,
}: {
  issuers: { data?: OperatorIssuer[]; isError: boolean };
  invitations: { data?: OperatorInvitation[]; isError: boolean };
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const revoke = useMutation({
    mutationFn: revokeOperatorInvitation,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['operator', 'invitations'] }),
  });

  function confirmRevoke(invitation: OperatorInvitation) {
    if (window.confirm(`¿Revocar la invitación de ${invitation.email}? Su enlace dejará de funcionar.`)) {
      revoke.mutate(invitation.id);
    }
  }

  const rows = issuers.data && invitations.data ? panelRows(issuers.data, invitations.data, query) : undefined;
  return (
    <section className="card" style={{ overflow: 'hidden' }} aria-labelledby="issuers">
      <div className="card-head">
        <h2 className="h3" id="issuers">
          Emisores
        </h2>
        <label className="affix" style={{ width: 300, maxWidth: '100%' }}>
          <span className="sr-only">Buscar emisor</span>
          <Icon name="search" />
          <input
            className="input"
            type="search"
            placeholder="Nombre, NIF o email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {(issuers.isError || invitations.isError || revoke.isError) && (
        <div className="card-pad stack" style={{ gap: 12 }}>
          {issuers.isError && <Alert tone="danger">No se han podido cargar los emisores. Recarga la página.</Alert>}
          {invitations.isError && (
            <Alert tone="danger">No se han podido cargar las invitaciones. Recarga la página.</Alert>
          )}
          {revoke.isError && (
            <Alert tone="danger">No se ha podido revocar la invitación. Puede que ya se haya usado.</Alert>
          )}
        </div>
      )}
      {rows?.length === 0 && (
        <p className="muted card-pad">
          {query.trim() ? 'Ningún emisor ni invitación coincide con la búsqueda.' : 'Aún no hay ningún emisor ni invitación.'}
        </p>
      )}
      {rows && rows.length > 0 && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Emisor</th>
              <th style={{ width: 160 }}>NIF</th>
              <th style={{ width: 220 }}>Autorización AEAT</th>
              <th className="r" style={{ width: 160 }}>
                Facturas emitidas
              </th>
              <th style={{ width: 160 }}>Alta</th>
              <th style={{ width: 120 }}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.type === 'issuer' ? (
                <tr key={row.issuer.id}>
                  <td style={{ fontWeight: 500 }}>{row.issuer.name}</td>
                  <td className="mono">{row.issuer.taxId}</td>
                  <td>
                    <RepresentationTag representation={row.issuer.representation} />
                  </td>
                  <td className="r num">{row.issuer.invoiceCount}</td>
                  <td className="num">
                    {row.issuer.onboardedAt ? formatDate(row.issuer.onboardedAt) : <span className="muted">En curso</span>}
                  </td>
                  <td />
                </tr>
              ) : (
                <tr key={row.invitation.id}>
                  <td className="muted">{row.invitation.email}</td>
                  <td className="muted">—</td>
                  <td>
                    <span className="tag tag-neutral">{INVITATION_LABELS[row.invitation.status]}</span>
                  </td>
                  <td className="r muted">—</td>
                  <td className="num">{formatDate(row.invitation.createdAt)}</td>
                  <td className="r">
                    {row.invitation.status === 'pending' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={revoke.isPending}
                        onClick={() => confirmRevoke(row.invitation)}
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}

function NewInvitation() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<CreatedInvitation>();
  const [copied, setCopied] = useState(false);
  const invite = useMutation({
    mutationFn: createOperatorInvitation,
    onSuccess: async (invitation) => {
      setCreated(invitation);
      setCopied(false);
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: ['operator', 'invitations'] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate({ email });
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <section
      className="card card-pad stack"
      style={{ flex: '0 1 420px', minWidth: 320, gap: 16 }}
      aria-labelledby="new-invitation"
    >
      <h2 className="h3" id="new-invitation">
        Enviar invitación
      </h2>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <Field
          label="Email del autónomo"
          type="email"
          required
          autoComplete="off"
          placeholder="nombre@dominio.es"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={invite.error instanceof ApiError && invite.error.status === 400 ? 'Escribe un email válido.' : undefined}
        />
        <button type="submit" className="btn btn-primary" disabled={invite.isPending}>
          <Icon name="mail" />
          {invite.isPending ? 'Enviando…' : 'Enviar invitación'}
        </button>
        <p className="help">El enlace caduca en 7 días.</p>
      </form>
      {invite.isError && !(invite.error instanceof ApiError && invite.error.status === 400) && (
        <Alert tone="danger">No se ha podido crear la invitación. Vuelve a intentarlo.</Alert>
      )}
      {created && (
        <Alert tone="ok" title={`Invitación enviada a ${created.email}`}>
          <p>El enlace sirve una sola vez y caduca el {formatDateTime(created.expiresAt)}. Solo se muestra ahora:</p>
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <code className="mono small" style={{ wordBreak: 'break-all' }}>
              {created.url}
            </code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(created.url)}>
              <Icon name={copied ? 'check' : 'link'} />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </Alert>
      )}
    </section>
  );
}
