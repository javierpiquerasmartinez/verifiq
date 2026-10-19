import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { CatalogItem } from '@verifiq/domain';
import { useId, useState } from 'react';
import { fetchCatalogItems } from '../api';
import { formatAmount, vatLabel } from '../format';
import { Icon } from './icons';

/** Lowercase without accents, to search names as typed. */
const foldAccents = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * "Añadir desde artículos": picks one of the issuer's CatalogItems, searched by name, for a new line.
 * Disabled when the draft has no room for another line.
 */
export function CatalogItemPicker({ onPick, disabled = false }: { onPick: (item: CatalogItem) => void; disabled?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const items = useQuery({ queryKey: ['catalog-items'], queryFn: fetchCatalogItems, enabled: open, retry: false });

  const q = foldAccents(search.trim());
  const matches = items.data?.filter((item) => foldAccents(item.name).includes(q));

  function close() {
    setOpen(false);
    setSearch('');
  }

  if (!open || disabled) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Icon name="list" />
        Añadir desde artículos
      </button>
    );
  }

  return (
    <div className="picker" style={{ width: '100%' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label className="label" htmlFor={id}>
          Añadir desde artículos
        </label>
        <button type="button" className="lnk small" onClick={close}>
          Cancelar
        </button>
      </div>
      <label className="affix">
        <Icon name="search" />
        <input
          id={id}
          className="input"
          type="search"
          placeholder="Buscar artículo por nombre"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoFocus
        />
      </label>
      <ul className="picker-list" aria-label="Artículos">
        {items.isPending && <li className="small muted picker-empty">Cargando…</li>}
        {items.isError && <li className="small muted picker-empty">No se han podido cargar tus artículos.</li>}
        {items.data?.length === 0 && (
          <li className="small muted picker-empty">
            Aún no tienes artículos.{' '}
            <Link to="/catalog-items/new" className="lnk">
              Crea el primero
            </Link>{' '}
            en Artículos.
          </li>
        )}
        {items.data && items.data.length > 0 && matches?.length === 0 && (
          <li className="small muted picker-empty">Ningún artículo coincide con la búsqueda.</li>
        )}
        {matches?.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="mi"
              onClick={() => {
                onPick(item);
                close();
              }}
            >
              <span style={{ flexGrow: 1 }}>
                {item.name}
                <small>{vatLabel(item.defaultVat)}</small>
              </span>
              <span className="num">{formatAmount(item.defaultUnitPrice)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
