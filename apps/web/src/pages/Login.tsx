import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { authClient, authErrorMessage, isChallengeExpired } from '../auth-client';
import { AccessLayout, Alert, Field } from '../ui/components';

type Step = 'password' | 'totp' | 'backup';

export function LoginPage() {
  const { motivo } = useSearch({ from: '/entrar' });
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { data, error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      setCode('');
      return setStep('totp');
    }
    await navigate({ to: '/' });
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { error } =
      step === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code: code.trim() })
        : await authClient.twoFactor.verifyBackupCode({ code: code.trim() });
    setPending(false);
    if (error) {
      if (isChallengeExpired(error)) setStep('password');
      return setError(authErrorMessage(error));
    }
    await navigate({ to: '/' });
  }

  if (step === 'password') {
    return (
      <AccessLayout title="Entrar en Verifiq" subtitle="Accede para emitir y consultar tus facturas.">
        {motivo === 'caducada' && (
          <Alert tone="info">Tu sesión ha caducado por inactividad. Vuelve a entrar.</Alert>
        )}
        {motivo === 'restablecida' && (
          <Alert tone="ok">Contraseña cambiada. Ya puedes entrar con la nueva.</Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <form className="stack" onSubmit={submitPassword}>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? 'Comprobando…' : 'Continuar'}
          </button>
        </form>
        <Link className="lnk small" to="/recuperar">
          ¿Has olvidado tu contraseña?
        </Link>
      </AccessLayout>
    );
  }

  const usingBackup = step === 'backup';
  return (
    <AccessLayout
      title="Verificación en dos pasos"
      subtitle={
        usingBackup
          ? 'Escribe uno de los códigos de recuperación que guardaste. Cada código sirve una sola vez.'
          : 'Abre tu aplicación de autenticación y escribe el código de 6 cifras de Verifiq.'
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <form className="stack" onSubmit={submitCode}>
        <Field
          label={usingBackup ? 'Código de recuperación' : 'Código de verificación'}
          className={usingBackup ? 'input mono' : 'input code'}
          inputMode={usingBackup ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          pattern={usingBackup ? undefined : '[0-9]{6}'}
          maxLength={usingBackup ? 32 : 6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? 'Comprobando…' : 'Entrar'}
        </button>
      </form>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button
          type="button"
          className="lnk small"
          onClick={() => {
            setStep(usingBackup ? 'totp' : 'backup');
            setCode('');
            setError(undefined);
          }}
        >
          {usingBackup ? 'Usar la aplicación de autenticación' : 'Usar un código de recuperación'}
        </button>
        <button
          type="button"
          className="lnk small"
          onClick={() => {
            setStep('password');
            setError(undefined);
          }}
        >
          Volver
        </button>
      </div>
    </AccessLayout>
  );
}
