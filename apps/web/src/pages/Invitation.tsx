import { PASSWORD_MIN_LENGTH } from '@verifiq/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { acceptInvitation, ApiError, fetchInvitation } from '../api';
import { AccessLayout, Alert, Field } from '../ui/components';

const PROBLEMS: Record<string, { title: string; text: string }> = {
  INVITATION_EXPIRED: {
    title: 'Esta invitación ha caducado',
    text: 'Las invitaciones caducan a los 7 días. Pide una nueva a quien te invitó.',
  },
  INVITATION_USED: {
    title: 'Esta invitación ya se ha usado',
    text: 'Si ya creaste tu cuenta, entra con tu email y contraseña. Si no fuiste tú, pide una nueva invitación.',
  },
  INVITATION_NOT_FOUND: {
    title: 'Esta invitación no es válida',
    text: 'Comprueba que has copiado el enlace completo o pide una nueva invitación.',
  },
};

function problemOf(error: unknown) {
  return (error instanceof ApiError && error.code && PROBLEMS[error.code]) || undefined;
}

export function InvitationPage() {
  const { token } = useParams({ from: '/invitacion/$token' });
  const navigate = useNavigate();
  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => fetchInvitation(token),
    retry: false,
  });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<{ title: string; text: string }>();
  const [pending, setPending] = useState(false);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort || mismatch) return;
    setPending(true);
    setError(undefined);
    try {
      await acceptInvitation(token, { name, password });
      await navigate({ to: '/configurar-2fa' });
    } catch (caught) {
      setPending(false);
      setError(
        problemOf(caught) ??
          (caught instanceof ApiError && caught.code === 'EMAIL_TAKEN'
            ? { title: 'Ya existe una cuenta con este email', text: 'Entra con tu contraseña.' }
            : { title: 'No se ha podido crear la cuenta', text: 'Vuelve a intentarlo.' }),
      );
    }
  }

  if (invitation.isPending) {
    return (
      <AccessLayout title="Invitación a Verifiq">
        <p className="muted">Comprobando la invitación…</p>
      </AccessLayout>
    );
  }

  if (invitation.isError) {
    const problem = problemOf(invitation.error) ?? {
      title: 'No se ha podido comprobar la invitación',
      text: 'Vuelve a intentarlo en unos minutos.',
    };
    return (
      <AccessLayout title="Invitación a Verifiq">
        <Alert tone="warn" title={problem.title}>
          {problem.text}
        </Alert>
      </AccessLayout>
    );
  }

  return (
    <AccessLayout
      title="Crea tu cuenta"
      subtitle="Elige tu contraseña. Después configurarás la verificación en dos pasos."
    >
      {error && (
        <Alert tone="danger" title={error.title}>
          {error.text}
        </Alert>
      )}
      <form className="stack" onSubmit={submit}>
        <Field label="Email" type="email" value={invitation.data.email} readOnly />
        <Field
          label="Nombre y apellidos"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          help={`Al menos ${PASSWORD_MIN_LENGTH} caracteres. Mejor una frase que solo tú recuerdes.`}
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
          {pending ? 'Creando la cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AccessLayout>
  );
}
