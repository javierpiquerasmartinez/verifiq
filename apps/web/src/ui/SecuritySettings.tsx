import { PASSWORD_MIN_LENGTH } from '@verifiq/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { authClient, authErrorMessage } from '../auth-client';
import { describeDevice } from '../devices';
import { formatDateTime } from '../format';
import { Alert, Field } from './components';

// Settings' security section: password, recovery codes and sessions, all on Better Auth's endpoints.

/** Changing the password signs out every other session (the API refuses to keep them). */
export function ChangePasswordForm() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < PASSWORD_MIN_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== newPassword;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort || mismatch || !newPassword) return;
    setPending(true);
    setError(undefined);
    setDone(false);
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    setCurrentPassword('');
    setNewPassword('');
    setRepeat('');
    setDone(true);
    await queryClient.invalidateQueries({ queryKey: ['sessions'] });
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="ok">Contraseña cambiada. Hemos cerrado tus sesiones en otros dispositivos.</Alert>}
      <Field
        label="Contraseña actual"
        type="password"
        autoComplete="current-password"
        required
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <div className="grid2">
        <Field
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          help={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}
          error={tooShort ? `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.` : undefined}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Field
          label="Repite la contraseña nueva"
          type="password"
          autoComplete="new-password"
          required
          error={mismatch ? 'Las contraseñas no coinciden.' : undefined}
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />
      </div>
      <p className="small muted">Al cambiarla se cerrarán tus sesiones en otros dispositivos.</p>
      <div className="row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </div>
    </form>
  );
}

/** New recovery codes replace the previous ones, used or not. */
export function RecoveryCodes() {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function generate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    setPending(false);
    if (error || !data) return setError(authErrorMessage(error ?? { status: 500 }));
    setPassword('');
    setAsking(false);
    setCodes(data.backupCodes);
  }

  if (codes) {
    return (
      <div className="stack">
        <Alert tone="warn" title="Guarda estos códigos de recuperación ahora">
          Solo se muestran esta vez y sustituyen a los anteriores, que ya no sirven. Cada código te permite entrar
          una vez si pierdes el móvil.
        </Alert>
        <ul className="codes" aria-label="Códigos de recuperación">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void navigator.clipboard.writeText(codes.join('\n'))}
          >
            Copiar códigos
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setCodes(undefined)}>
            Ya los he guardado
          </button>
        </div>
      </div>
    );
  }

  if (!asking) {
    return (
      <div className="stack">
        <p className="ink2">
          Si has usado o perdido tus códigos de recuperación, genera unos nuevos. Los anteriores dejarán de
          funcionar.
        </p>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => setAsking(true)}>
            Generar códigos nuevos
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={generate}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field
        label="Tu contraseña"
        type="password"
        autoComplete="current-password"
        required
        help="Por seguridad, confírmala antes de generar códigos nuevos."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={() => setAsking(false)}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Generando…' : 'Generar códigos nuevos'}
        </button>
      </div>
    </form>
  );
}

async function fetchSessions() {
  const [sessions, current] = await Promise.all([
    authClient.listSessions(),
    authClient.getSession({ query: { disableCookieCache: true } }),
  ]);
  if (sessions.error) throw sessions.error;
  const currentToken = current.data?.session.token;
  return (sessions.data ?? [])
    .map((session) => ({ ...session, current: session.token === currentToken }))
    .sort((a, b) => Number(b.current) - Number(a.current) || +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** The user's open sessions; any but this one can be closed. */
export function SessionList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: fetchSessions, retry: false });
  const [revoking, setRevoking] = useState<string>();
  const [error, setError] = useState<string>();

  // Better Auth's errors carry the status; the session may expire while the page is open.
  const expired = (sessions.error as { status?: number } | null)?.status === 401;
  useEffect(() => {
    if (expired) void navigate({ to: '/sign-in', search: { reason: 'expired' } });
  }, [expired, navigate]);

  async function revoke(token: string) {
    setRevoking(token);
    setError(undefined);
    const { error } = await authClient.revokeSession({ token });
    setRevoking(undefined);
    if (error) return setError(authErrorMessage(error));
    await queryClient.invalidateQueries({ queryKey: ['sessions'] });
  }

  if (sessions.isPending) return <p className="muted">Cargando…</p>;
  if (sessions.isError) return <Alert tone="danger">No se han podido cargar tus sesiones. Recarga la página.</Alert>;

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      <table className="tbl">
        <thead>
          <tr>
            <th>Dispositivo</th>
            <th>IP</th>
            <th>Iniciada</th>
            <th>Última actividad</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.data.map((session) => (
            <tr key={session.token}>
              <td>{describeDevice(session.userAgent)}</td>
              <td className="mono">{session.ipAddress || '—'}</td>
              <td>{formatDateTime(new Date(session.createdAt).toISOString())}</td>
              <td>{formatDateTime(new Date(session.updatedAt).toISOString())}</td>
              <td className="r">
                {session.current ? (
                  <span className="tag tag-ok">Esta sesión</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void revoke(session.token)}
                    disabled={revoking === session.token}
                  >
                    {revoking === session.token ? 'Cerrando…' : 'Cerrar sesión'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
