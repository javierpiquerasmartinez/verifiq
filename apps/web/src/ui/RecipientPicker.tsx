import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { draftRecipientSchema, type DraftRecipient, type Recipient } from '@verifiq/domain';
import { useDeferredValue, useId, useState } from 'react';
import { fetchRecipients } from '../api';
import { CensusTag } from './CensusTag';
import { Icon } from './icons';
import { RecipientForm } from './RecipientForm';

/** Drops what a draft does not show (whether the recipient has invoices). */
const draftRecipientOf = (recipient: Recipient): DraftRecipient => draftRecipientSchema.parse(recipient);

/**
 * Picks the Recipient of a draft among the active ones, with search, or creates one inline
 * without leaving the invoice.
 */
export function RecipientPicker({
  id: givenId,
  value,
  onChange,
  error,
}: {
  /** The id of the field, to point to it; one is generated otherwise. */
  id?: string;
  value: DraftRecipient | null;
  onChange: (recipient: DraftRecipient) => void;
  error?: string;
}) {
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const queryClient = useQueryClient();
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const open = searching || (!value && !creating);
  const recipients = useQuery({
    queryKey: ['recipients', 'active', q],
    queryFn: () => fetchRecipients({ q, status: 'active' }),
    placeholderData: keepPreviousData,
    enabled: open,
    retry: false,
  });

  function pick(recipient: DraftRecipient) {
    onChange(recipient);
    setSearching(false);
    setCreating(false);
    setSearch('');
  }

  async function created(recipient: Recipient) {
    await queryClient.invalidateQueries({ queryKey: ['recipients'] });
    pick(draftRecipientOf(recipient));
  }

  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        Cliente
      </label>
      {!open && value && (
        <button
          id={id}
          type="button"
          className="input picked"
          onClick={() => setSearching(true)}
          aria-describedby={`${id}-hint`}
          aria-label={`Cliente: ${value.name}. Cambiar`}
        >
          <span className="picked-name">
            <b>{value.name}</b>
            <span className="mono xs muted">
              {value.taxId} · {value.postalCode} {value.municipality}
            </span>
          </span>
          <CensusTag status={value.censusStatus} />
          <Icon name="chevron" />
        </button>
      )}
      {open && !creating && (
        <div className="picker">
          <label className="affix">
            <Icon name="search" />
            <input
              id={id}
              className="input"
              type="search"
              placeholder="Buscar cliente por nombre, NIF o municipio"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-hint`}
              autoFocus={searching}
            />
          </label>
          <ul className="picker-list" aria-label="Clientes">
            {recipients.isError && <li className="small muted picker-empty">No se han podido cargar tus clientes.</li>}
            {recipients.data?.length === 0 && (
              <li className="small muted picker-empty">
                {q ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no tienes clientes.'}
              </li>
            )}
            {recipients.data?.map((recipient) => (
              <li key={recipient.id}>
                <button type="button" className="mi" onClick={() => pick(draftRecipientOf(recipient))}>
                  <span style={{ flexGrow: 1 }}>
                    {recipient.name}
                    <small className="mono">
                      {recipient.taxId} · {recipient.municipality}
                    </small>
                  </span>
                  {recipient.censusStatus !== 'identified' && <CensusTag status={recipient.censusStatus} />}
                </button>
              </li>
            ))}
          </ul>
          {value && (
            <button type="button" className="lnk small" style={{ alignSelf: 'flex-start' }} onClick={() => setSearching(false)}>
              Mantener {value.name}
            </button>
          )}
        </div>
      )}
      {creating && (
        <div className="inline-form stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 className="label">Nuevo cliente</h3>
            <button type="button" className="lnk small" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
          <RecipientForm submitLabel="Guardar cliente y usarlo" onSaved={created} />
        </div>
      )}
      {error && !creating ? (
        <p className="err" id={`${id}-hint`}>
          {error}
        </p>
      ) : (
        !creating && (
          <p className="help" id={`${id}-hint`}>
            ¿No está en la lista?{' '}
            <button type="button" className="lnk" onClick={() => setCreating(true)}>
              Crear cliente nuevo
            </button>{' '}
            sin salir de la factura.
          </p>
        )
      )}
      {value?.archived && !open && (
        <p className="help">Este cliente está archivado: elige otro o recupéralo en Clientes antes de emitir.</p>
      )}
      {value?.censusStatus === 'unchecked' && !open && (
        <p className="help">
          No se pudo comprobar su NIF en el censo de Hacienda. Vuelve a guardarlo en Clientes antes de emitir.
        </p>
      )}
    </div>
  );
}
