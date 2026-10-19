import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { fetchCatalogItems } from '../api';
import { formatAmount, vatLabel } from '../format';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { Alert } from '../ui/components';
import { Icon } from '../ui/icons';

/** The issuer's catalog items ("Artículos"): the concepts repeated on every invoice. */
export function CatalogItemsPage() {
  const items = useQuery({ queryKey: ['catalog-items'], queryFn: fetchCatalogItems, retry: false });
  useSessionExpiry(items.error);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="h1">Artículos</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Los conceptos que repites en tus facturas, con su precio e IVA por defecto.
          </p>
        </div>
        <Link to="/catalog-items/new" className="btn btn-primary">
          <Icon name="plus" />
          Nuevo artículo
        </Link>
      </div>

      {items.isError && <Alert tone="danger">No se han podido cargar tus artículos. Recarga la página.</Alert>}
      {items.isPending && <p>Cargando…</p>}
      {items.data?.length === 0 && (
        <div className="card" style={{ padding: 24 }}>
          <p className="muted">
            Aún no tienes artículos. Crea los conceptos que facturas cada mes y añádelos a una factura con un clic.
          </p>
        </div>
      )}
      {items.data && items.data.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Nombre</th>
                <th className="r" style={{ width: 180 }}>
                  Precio por defecto
                </th>
                <th style={{ width: 360 }}>IVA por defecto</th>
              </tr>
            </thead>
            <tbody>
              {items.data.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to="/catalog-items/$catalogItemId" params={{ catalogItemId: item.id }} className="lnk">
                      {item.name}
                    </Link>
                  </td>
                  <td className="r num">{formatAmount(item.defaultUnitPrice)}</td>
                  <td>{vatLabel(item.defaultVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
