import { PASSWORD_MIN_LENGTH } from '@verifiq/domain';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { authClient, authErrorMessage } from '../auth-client';
import { AccessLayout, Alert, Field } from '../ui/components';

export function ResetPasswordPage() {
  const { token } = useSearch({ from: '/restablecer' });
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || tooShort || mismatch) return;
    setPending(true);
    setError(undefined);
    const { error } = await authClient.resetPassword({ token, newPassword: password });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    await navigate({ to: '/entrar', search: { motivo: 'restablecida' } });
  }

  const footer = (
    <Link className="lnk" to="/recuperar">
      Pedir un enlace nuevo
    </Link>
  );

  if (!token) {
    return (
      <AccessLayout title="Restablece tu contraseña" footer={footer}>
        <Alert tone="warn" title="Este enlace no es válido">
          Abre el enlace completo que te enviamos por email o pide uno nuevo.
        </Alert>
      </AccessLayout>
    );
  }

  return (
    <AccessLayout
      title="Elige una contraseña nueva"
      subtitle="Al cambiarla se cerrarán todas tus sesiones abiertas."
      footer={footer}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <form className="stack" onSubmit={submit}>
        <Field
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          help={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}
          error={tooShort ? `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.` : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          required
          error={mismatch ? 'Las contraseñas no coinciden.' : undefined}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>
    </AccessLayout>
  );
}
