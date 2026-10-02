import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './api';

export function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <main>
      <h1>Verifiq</h1>
      {health.isPending && <p>Conectando con la API…</p>}
      {health.isError && <p role="alert">No se pudo contactar con la API.</p>}
      {health.isSuccess && (
        <dl>
          <dt>Versión de la API</dt>
          <dd>{health.data.version}</dd>
          <dt>Base de datos</dt>
          <dd>Conectada</dd>
        </dl>
      )}
      <footer>Versión web {__APP_VERSION__}</footer>
    </main>
  );
}
