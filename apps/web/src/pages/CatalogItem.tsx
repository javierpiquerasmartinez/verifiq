import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { CatalogItem } from '@verifiq/domain';
import { useState } from 'react';
import { ApiError, deleteCatalogItem, fetchCatalogItem, fetchOnboarding } from '../api';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { CatalogItemForm } from '../ui/CatalogItemForm';
import { Alert } from '../ui/components';

function BackLink() {
  return (
    <Link to="/catalog-items" className="lnk small">
      ← Artículos
    </Link>
  );
}

/** A new CatalogItem, with the issuer's default VAT. */
export function NewCatalogItemPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  useSessionExpiry(onboarding.error);

  async function saved(item: CatalogItem) {
    await queryClient.invalidateQueries({ queryKey: ['catalog-items'] });
    queryClient.setQueryData(['catalog-item', item.id], item);
    await navigate({ to: '/catalog-items' });
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <BackLink />
          <h1 className="h1">Nuevo artículo</h1>
        </div>
      </div>
      {onboarding.isPending && <p>Cargando…</p>}
      {onboarding.isError && <Alert tone="danger">No se ha podido cargar el formulario. Recarga la página.</Alert>}
      {onboarding.data?.defaults && (
        <section className="card" style={{ padding: 24, maxWidth: 760 }}>
          <CatalogItemForm defaultVat={onboarding.data.defaults.vat} submitLabel="Guardar artículo" onSaved={saved} />
        </section>
      )}
    </AppShell>
  );
}

/** Edit or delete a CatalogItem: the lines already copied from it keep their values. */
export function CatalogItemPage() {
  const { catalogItemId } = useParams({ from: '/catalog-items/$catalogItemId' });
  const queryClient = useQueryClient();
  const item = useQuery({
    queryKey: ['catalog-item', catalogItemId],
    queryFn: () => fetchCatalogItem(catalogItemId),
    retry: false,
  });
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  const [notice, setNotice] = useState<string>();
  useSessionExpiry(item.error ?? onboarding.error);

  async function saved(next: CatalogItem) {
    queryClient.setQueryData(['catalog-item', next.id], next);
    await queryClient.invalidateQueries({ queryKey: ['catalog-items'] });
    setNotice('Cambios guardados.');
  }

  const notFound = item.error instanceof ApiError && item.error.status === 404;

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <BackLink />
          <h1 className="h1">{item.data?.name ?? 'Artículo'}</h1>
        </div>
      </div>
      {(item.isPending || onboarding.isPending) && <p>Cargando…</p>}
      {notFound && <Alert tone="danger">Este artículo no existe o se ha borrado.</Alert>}
      {(onboarding.isError || (item.isError && !notFound)) && (
        <Alert tone="danger">No se ha podido cargar el artículo. Recarga la página.</Alert>
      )}
      {item.data && onboarding.data?.defaults && (
        <div className="stack" style={{ maxWidth: 760 }}>
          {notice && <Alert tone="ok">{notice}</Alert>}
          <section className="card stack" style={{ padding: 24 }}>
            <Alert tone="info">
              Los cambios solo se aplican a las líneas que añadas a partir de ahora: los borradores y las facturas
              conservan los valores que copiaron.
            </Alert>
            <CatalogItemForm
              key={item.dataUpdatedAt}
              item={item.data}
              defaultVat={onboarding.data.defaults.vat}
              submitLabel="Guardar cambios"
              onSaved={saved}
            />
          </section>
          <DeleteCatalogItem item={item.data} />
        </div>
      )}
    </AppShell>
  );
}

function DeleteCatalogItem({ item }: { item: CatalogItem }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    if (!window.confirm(`¿Borrar el artículo ${item.name}? No se puede deshacer.`)) return;
    setPending(true);
    setError(undefined);
    try {
      await deleteCatalogItem(item.id);
      queryClient.removeQueries({ queryKey: ['catalog-item', item.id] });
      await queryClient.invalidateQueries({ queryKey: ['catalog-items'] });
      await navigate({ to: '/catalog-items' });
    } catch {
      setError('No se ha podido borrar el artículo. Vuelve a intentarlo.');
      setPending(false);
    }
  }

  return (
    <section className="card stack" style={{ padding: 24 }} aria-labelledby="catalog-item-delete">
      <h2 className="h3" id="catalog-item-delete">
        Borrar
      </h2>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="small muted">Las líneas que ya lo usan no cambian: conservan su concepto, precio e IVA.</p>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={remove} disabled={pending}>
          Borrar artículo
        </button>
      </div>
    </section>
  );
}
