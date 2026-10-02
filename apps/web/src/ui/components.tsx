import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { BrandMark, Icon } from './icons';

type Tone = 'danger' | 'warn' | 'info' | 'ok';
const toneIcon = { danger: 'alert', warn: 'alert', info: 'info', ok: 'check' } as const;

export function Alert({ tone, title, children }: { tone: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={toneIcon[tone]} />
      <div>
        {title && <p style={{ fontWeight: 600 }}>{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  help,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? `${id}-hint` : undefined}
        {...input}
      />
      {error ? (
        <p className="err" id={`${id}-hint`}>
          {error}
        </p>
      ) : (
        help && (
          <p className="help" id={`${id}-hint`}>
            {help}
          </p>
        )
      )}
    </div>
  );
}

/** Centred card used by every access screen (sign-in, invitation, 2FA, recovery). */
export function AccessLayout({
  title,
  subtitle,
  wide,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="access">
      <span className="brand">
        <BrandMark />
        Verifiq
      </span>
      <main className={`card access-card${wide ? ' wide' : ''}`}>
        <div className="access-head">
          <h1 className="h2">{title}</h1>
          {subtitle && <p className="ink2">{subtitle}</p>}
        </div>
        {children}
      </main>
      {footer && <div className="access-foot">{footer}</div>}
      <footer className="access-foot">Verifiq {__APP_VERSION__} · Sistema de facturación VERI*FACTU</footer>
    </div>
  );
}
