import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IssuerErrorCode,
  representationSignerSchema,
  type Representation,
  type RepresentationError,
  type RepresentationSigner,
} from '@verifiq/domain';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  fetchOnboarding,
  fetchRepresentation,
  resendRepresentationLink,
  startRepresentationSigning,
} from '../api';
import { useSessionExpiry } from '../session';
import { Alert, Field } from './components';

/** How often the state is asked for while the signer has the link open. */
const POLL_MS = 5000;

const ERROR_MESSAGES: Record<RepresentationError, string> = {
  rejected: 'La firma no se ha completado: la verificación de identidad no fue válida.',
  expired: 'El enlace de firma caducó antes de completarla.',
  cancelled: 'La autorización se canceló.',
  'issuer-not-accepted': 'El sistema de registro no ha aceptado tu NIF.',
};

function actionError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case IssuerErrorCode.ConnectorUnavailable:
        return 'El servicio de registro no responde ahora mismo. Vuelve a intentarlo en unos minutos.';
      case IssuerErrorCode.ConnectorRejected:
        return 'No se ha podido iniciar la firma. Revisa tus datos y vuelve a intentarlo.';
      case IssuerErrorCode.RepresentationNotPending:
        return 'Ya no hay ninguna firma pendiente.';
    }
  }
  return 'No se ha podido completar la acción. Vuelve a intentarlo.';
}

/**
 * The Representation (onboarding step 5, also in settings): its state, the signing form and
 * resending the link. Polls while a signing is pending; the header's warning follows it.
 */
export function RepresentationPanel() {
  const queryClient = useQueryClient();
  const representation = useQuery({
    queryKey: ['representation'],
    queryFn: fetchRepresentation,
    retry: false,
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? POLL_MS : false),
  });
  useSessionExpiry(representation.error);

  const canIssue = representation.data?.canIssue;
  useEffect(() => {
    if (canIssue !== undefined) void queryClient.invalidateQueries({ queryKey: ['issuer'] });
  }, [canIssue, queryClient]);

  if (representation.isPending) return <p>Consultando el estado de tu autorización…</p>;
  if (representation.isError) {
    return <Alert tone="danger">No se ha podido consultar tu autorización. Recarga la página.</Alert>;
  }
  const data = representation.data;
  const notAccepted = data.error === 'issuer-not-accepted';
  const canSign = data.state === 'not-started' || (data.state === 'error' && !notAccepted);
  const updated = (next: Representation) => queryClient.setQueryData(['representation'], next);

  return (
    <div className="stack">
      {data.stale && (
        <Alert tone="warn">
          No hemos podido consultar el estado ahora mismo; te mostramos el último que conocemos.
        </Alert>
      )}
      {data.state === 'not-required' && (
        <Alert tone="ok" title="No necesitas firmar la autorización">
          En el entorno de pruebas las facturas se registran sin ella. Ya puedes emitir.
        </Alert>
      )}
      {data.state === 'signed' && (
        <Alert tone="ok" title="Autorización firmada">
          Verifiq ya puede registrar tus facturas en la AEAT. Ya puedes emitir.
        </Alert>
      )}
      {data.state === 'pending' && <PendingSigning representation={data} onUpdated={updated} />}
      {notAccepted && (
        <Alert tone="danger" title={ERROR_MESSAGES['issuer-not-accepted']}>
          Comprueba que tu NIF está dado de alta en la AEAT y escríbenos para revisarlo.
        </Alert>
      )}
      {canSign && (
        <>
          {data.error && (
            <Alert tone="danger" title={ERROR_MESSAGES[data.error]}>
              Puedes volver a firmarla.
            </Alert>
          )}
          <SigningForm onUpdated={updated} />
        </>
      )}
    </div>
  );
}

function PendingSigning({
  representation,
  onUpdated,
}: {
  representation: Representation;
  onUpdated: (next: Representation) => void;
}) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string }>();

  async function resend() {
    setPending(true);
    setNotice(undefined);
    try {
      onUpdated(await resendRepresentationLink());
      setNotice({ tone: 'ok', text: 'Te hemos vuelto a enviar el enlace a tu email.' });
    } catch (error) {
      setNotice({ tone: 'danger', text: actionError(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Alert tone="info" title="Firma pendiente">
        Te hemos enviado el enlace por email. Ábrelo y verifica tu identidad con tu DNI; cuando termines, esta
        página se actualizará sola.
      </Alert>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div className="row">
        {representation.signingUrl && (
          <a className="btn btn-primary" href={representation.signingUrl} target="_blank" rel="noopener noreferrer">
            Abrir la firma
          </a>
        )}
        <button type="button" className="btn btn-secondary" onClick={resend} disabled={pending}>
          {pending ? 'Enviando…' : 'Reenviar enlace'}
        </button>
      </div>
    </>
  );
}

type SignerValues = Record<keyof RepresentationSigner, string>;

const FIELD_ERRORS: Record<keyof RepresentationSigner, string> = {
  firstName: 'Escribe tu nombre.',
  lastNames: 'Escribe tus apellidos.',
  street: 'Escribe la calle de tu domicilio.',
  streetNumber: 'Escribe el número.',
  municipality: 'Escribe el municipio.',
};

function SigningForm({ onUpdated }: { onUpdated: (next: Representation) => void }) {
  // Prefilled from the fiscal data; the signer checks it against their DNI.
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  const fiscalData = onboarding.data?.fiscalData;
  const [values, setValues] = useState<SignerValues>();
  const [errors, setErrors] = useState<Partial<SignerValues>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const [firstName = '', ...lastNames] = (fiscalData?.name ?? '').split(/\s+/);
  const current: SignerValues = values ?? {
    firstName,
    lastNames: lastNames.join(' '),
    street: '',
    streetNumber: '',
    municipality: fiscalData?.municipality ?? '',
  };

  const field = (key: keyof RepresentationSigner) => ({
    value: current[key],
    error: errors[key],
    onChange: (event: { target: { value: string } }) => {
      setValues({ ...current, [key]: event.target.value });
      setErrors((previous) => ({ ...previous, [key]: undefined }));
    },
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = representationSignerSchema.safeParse(current);
    if (!parsed.success) {
      const fieldErrors: Partial<SignerValues> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof RepresentationSigner;
        fieldErrors[key] = FIELD_ERRORS[key];
      }
      return setErrors(fieldErrors);
    }
    // Opened within the click, so popup blockers let it through; it gets the URL once known.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setPending(true);
    setError(undefined);
    try {
      const next = await startRepresentationSigning(parsed.data);
      onUpdated(next);
      if (tab && next.signingUrl) tab.location.href = next.signingUrl;
      else tab?.close();
    } catch (cause) {
      tab?.close();
      setError(actionError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p className="ink2">
        Para registrar tus facturas en la AEAT en tu nombre, Verifiq necesita que firmes una autorización. Se firma
        en línea verificando tu identidad con tu DNI, sin certificado digital. Te enviaremos el enlace por email.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid">
        <Field label="Nombre" autoComplete="given-name" required {...field('firstName')} />
        <div className="span2">
          <Field label="Apellidos" autoComplete="family-name" required {...field('lastNames')} />
        </div>
        <div className="span2">
          <Field label="Calle" autoComplete="address-line1" required {...field('street')} />
        </div>
        <Field label="Número" required {...field('streetNumber')} />
        <div className="span3">
          <Field label="Municipio" autoComplete="address-level2" required {...field('municipality')} />
        </div>
      </div>
      <p className="small muted">Escríbelos tal como aparecen en tu DNI.</p>
      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Iniciando la firma…' : 'Firmar autorización'}
      </button>
    </form>
  );
}
