import { useNavigate } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type FormEvent } from 'react';
import { authClient, authErrorMessage } from '../auth-client';
import { AccessLayout, Alert, Field } from '../ui/components';

type Step = 'password' | 'scan' | 'codes';

const STEPS: { id: Step; label: string }[] = [
  { id: 'password', label: 'Confirmar contraseña' },
  { id: 'scan', label: 'Vincular la aplicación' },
  { id: 'codes', label: 'Guardar códigos' },
];

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="steps" aria-label="Pasos">
      {STEPS.map((step, i) => (
        <li
          key={step.id}
          className={`step${i < index ? ' done' : ''}${i === index ? ' on' : ''}`}
          aria-current={i === index ? 'step' : undefined}
        >
          <span className="n">{i + 1}</span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

/** Mandatory 2FA set-up: nothing else is reachable until it is done. */
export function SetUpTwoFactorPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [totpURI, setTotpURI] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function enable(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || !data || !('totpURI' in data)) return setError(authErrorMessage(error ?? { status: 500 }));
    setPassword('');
    setTotpURI(data.totpURI ?? '');
    setBackupCodes(data.backupCodes ?? []);
    setStep('scan');
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    setStep('codes');
  }

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/entrar' });
  }

  const secret = totpURI ? new URL(totpURI).searchParams.get('secret') : null;

  return (
    <AccessLayout
      wide
      title="Protege tu cuenta"
      subtitle="Verifiq exige la verificación en dos pasos: además de tu contraseña, al entrar te pediremos un código de tu móvil."
      footer={
        <button type="button" className="lnk" onClick={signOut}>
          Cerrar sesión
        </button>
      }
    >
      <Stepper current={step} />
      {error && <Alert tone="danger">{error}</Alert>}

      {step === 'password' && (
        <form className="stack" onSubmit={enable}>
          <Field
            label="Tu contraseña"
            type="password"
            autoComplete="current-password"
            required
            help="Por seguridad, confírmala antes de continuar."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? 'Comprobando…' : 'Continuar'}
          </button>
        </form>
      )}

      {step === 'scan' && (
        <form className="stack" onSubmit={verify}>
          <p className="ink2">
            Escanea este código con una aplicación de autenticación (Google Authenticator, Microsoft
            Authenticator, 1Password…).
          </p>
          <div className="qr">
            <QRCodeSVG value={totpURI} size={184} marginSize={0} title="Código QR para la aplicación de autenticación" />
          </div>
          {secret && (
            <div className="field">
              <span className="label">¿No puedes escanearlo? Escribe esta clave en la aplicación</span>
              <p className="secret">{secret}</p>
            </div>
          )}
          <Field
            label="Código de 6 cifras que muestra la aplicación"
            className="input code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn btn-primary btn-block" disabled={pending}>
            {pending ? 'Comprobando…' : 'Activar la verificación'}
          </button>
        </form>
      )}

      {step === 'codes' && (
        <div className="stack">
          <Alert tone="warn" title="Guarda estos códigos de recuperación ahora">
            Solo se muestran esta vez. Si pierdes el móvil, cada código te permite entrar una vez.
            Guárdalos en un lugar seguro, fuera del móvil.
          </Alert>
          <ul className="codes" aria-label="Códigos de recuperación">
            {backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void navigator.clipboard.writeText(backupCodes.join('\n'))}
            >
              Copiar códigos
            </button>
          </div>
          <label className="chk">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>He guardado mis códigos de recuperación en un lugar seguro.</span>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!saved}
            onClick={() => void navigate({ to: '/' })}
          >
            Ir a Verifiq
          </button>
        </div>
      )}
    </AccessLayout>
  );
}
