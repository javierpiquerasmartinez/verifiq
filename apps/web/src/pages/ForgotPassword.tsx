import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { authClient, authErrorMessage } from '../auth-client';
import { AccessLayout, Alert, Field } from '../ui/components';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { error } = await authClient.requestPasswordReset({ email });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  }

  return (
    <AccessLayout
      title="Recupera tu contraseña"
      subtitle="Te enviaremos un enlace para elegir una contraseña nueva."
      footer={
        <Link className="lnk" to="/sign-in">
          Volver a entrar
        </Link>
      }
    >
      {sent ? (
        <Alert tone="ok" title="Revisa tu correo">
          Si hay una cuenta con <b>{email}</b>, te hemos enviado un enlace. Caduca en 1 hora.
        </Alert>
      ) : (
        <>
          {error && <Alert tone="danger">{error}</Alert>}
          <form className="stack" onSubmit={submit}>
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-primary btn-block" disabled={pending}>
              {pending ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>
        </>
      )}
    </AccessLayout>
  );
}
