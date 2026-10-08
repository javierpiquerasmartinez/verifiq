import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type {
  CreatedInvitation,
  InvitationStatus,
  OperatorInvitation,
  OperatorIssuer,
  RecordAlert,
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
import { formatDateTime } from '../format';
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
      <div className="page-head">
        <div>
          <h1 className="h1">Panel del operador</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Invitaciones y salud de los emisores. Sin acceso a facturas ni clientes.
          </p>
        </div>
      </div>
      <div className="stack" style={{ gap: 32 }}>
        <Section title="Alertas de registros">
          {alerts.isError && <Alert tone="danger">No se han podido cargar las alertas. Recarga la página.</Alert>}
          {alerts.data && <Alerts alerts={alerts.data} />}
        </Section>
        <Section title="Emisores">
          {issuers.isError && <Alert tone="danger">No se han podido cargar los emisores. Recarga la página.</Alert>}
          {issuers.data && <Issuers issuers={issuers.data} />}
        </Section>
        <Section title="Invitaciones">
          <NewInvitation />
          {invitations.isError && <Alert tone="danger">No se han podido cargar las invitaciones. Recarga la página.</Alert>}
          {invitations.data && <Invitations invitations={invitations.data} />}
        </Section>
      </div>
    </OperatorShell>
  );
}

function OperatorShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/sign-in' });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand">
            <BrandMark />
            Verifiq
          </span>
          <span className="tag tag-neutral">Operador</span>
          <span style={{ flexGrow: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="foot">
        <span>Verifiq {__APP_VERSION__}</span>
        <span>Sistema de facturación VERI*FACTU</span>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stack" style={{ gap: 12 }} aria-label={title}>
      <h2 className="h2">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <p className="muted">{children}</p>
    </div>
  );
}

function Alerts({ alerts }: { alerts: RecordAlert[] }) {
  if (alerts.length === 0) return <Empty>Ningún registro rechazado ni sin confirmar.</Empty>;
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 170 }}>Alerta</th>
            <th>Emisor</th>
            <th style={{ width: 170 }}>Factura</th>
            <th style={{ width: 190 }}>Desde</th>
            <th style={{ width: 150 }}>Código AEAT</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.invoiceRecordId}>
              <td>
                {alert.kind === 'rejected' ? (
                  <span className="tag tag-danger">Rechazado</span>
                ) : (
                  <span className="tag tag-warn">Sin confirmar 24 h</span>
                )}
              </td>
              <td>
                {alert.issuer.name}
                <div className="xs muted mono">{alert.issuer.taxId}</div>
              </td>
              <td className="mono">{alert.invoiceNumber}</td>
              <td className="num">{formatDateTime(alert.since)}</td>
              <td className="mono">{alert.aeatErrorCode ?? <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The `tag-*` styles. */
type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

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

function Issuers({ issuers }: { issuers: OperatorIssuer[] }) {
  if (issuers.length === 0) return <Empty>Aún no hay ningún emisor dado de alta.</Empty>;
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Emisor</th>
            <th style={{ width: 160 }}>NIF</th>
            <th style={{ width: 130 }}>Alta</th>
            <th style={{ width: 190 }}>Autorización AEAT</th>
            <th className="r" style={{ width: 110 }}>
              Facturas
            </th>
            <th className="r" style={{ width: 130 }}>
              Incidencias
            </th>
          </tr>
        </thead>
        <tbody>
          {issuers.map((issuer) => (
            <tr key={issuer.id}>
              <td>{issuer.name}</td>
              <td className="mono">{issuer.taxId}</td>
              <td>
                {issuer.onboardingCompleted ? (
                  <span className="tag tag-ok">Completa</span>
                ) : (
                  <span className="tag tag-neutral">En curso</span>
                )}
              </td>
              <td>
                <RepresentationTag representation={issuer.representation} />
              </td>
              <td className="r num">{issuer.invoiceCount}</td>
              <td className="r num" style={issuer.openIncidents > 0 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                {issuer.openIncidents}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="card card-pad stack" style={{ gap: 16 }}>
      <form className="row" style={{ alignItems: 'flex-end', gap: 12 }} onSubmit={submit}>
        <div style={{ flexGrow: 1, maxWidth: 420 }}>
          <Field
            label="Email de la persona invitada"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={
              invite.error instanceof ApiError && invite.error.status === 400 ? 'Escribe un email válido.' : undefined
            }
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={invite.isPending}>
          <Icon name="plus" />
          {invite.isPending ? 'Invitando…' : 'Invitar'}
        </button>
      </form>
      {invite.isError && !(invite.error instanceof ApiError && invite.error.status === 400) && (
        <Alert tone="danger">No se ha podido crear la invitación. Vuelve a intentarlo.</Alert>
      )}
      {created && (
        <Alert tone="ok" title={`Invitación enviada a ${created.email}`}>
          <p>El enlace sirve una sola vez y caduca el {formatDateTime(created.expiresAt)}. Solo se muestra ahora:</p>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
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
    </div>
  );
}

const INVITATION_STATUS_LABELS: Record<InvitationStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pendiente', tone: 'info' },
  accepted: { label: 'Aceptada', tone: 'ok' },
  expired: { label: 'Caducada', tone: 'neutral' },
  revoked: { label: 'Revocada', tone: 'neutral' },
};

function Invitations({ invitations }: { invitations: OperatorInvitation[] }) {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: revokeOperatorInvitation,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['operator', 'invitations'] }),
  });

  function confirmRevoke(invitation: OperatorInvitation) {
    if (window.confirm(`¿Revocar la invitación de ${invitation.email}? Su enlace dejará de funcionar.`)) {
      revoke.mutate(invitation.id);
    }
  }

  if (invitations.length === 0) return <Empty>Aún no has invitado a nadie.</Empty>;
  return (
    <>
      {revoke.isError && <Alert tone="danger">No se ha podido revocar la invitación. Puede que ya se haya usado.</Alert>}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th style={{ width: 130 }}>Estado</th>
              <th style={{ width: 190 }}>Enviada</th>
              <th style={{ width: 190 }}>Caduca</th>
              <th style={{ width: 120 }}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => {
              const { label, tone } = INVITATION_STATUS_LABELS[invitation.status];
              return (
                <tr key={invitation.id}>
                  <td>{invitation.email}</td>
                  <td>
                    <span className={`tag tag-${tone}`}>{label}</span>
                  </td>
                  <td className="num">{formatDateTime(invitation.createdAt)}</td>
                  <td className="num">{formatDateTime(invitation.expiresAt)}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
