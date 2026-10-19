import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { fetchRepresentation } from '../api';
import { authClient } from '../auth-client';
import { AccessLayout } from '../ui/components';
import { RepresentationPanel } from '../ui/RepresentationPanel';
import { Stepper } from '../ui/Stepper';

/**
 * Onboarding step 5: sign the Representation. It can wait: the app is usable meanwhile, only
 * issuing stays disabled, and the header's warning brings the user back here.
 */
export function RepresentationStepPage() {
  const navigate = useNavigate();
  // Shares the cache with the panel, which polls it.
  const representation = useQuery({ queryKey: ['representation'], queryFn: fetchRepresentation, retry: false });
  const canIssue = representation.data?.canIssue;

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/sign-in' });
  }

  return (
    <AccessLayout
      wide="wider"
      title="Autoriza a Verifiq ante la AEAT"
      subtitle="Último paso. Puedes hacerlo ahora o más tarde: mientras tanto podrás preparar clientes, artículos y borradores, pero no emitir facturas."
      footer={
        <button type="button" className="lnk" onClick={signOut}>
          Cerrar sesión
        </button>
      }
    >
      <Stepper current="representation" reached="completed" />
      <RepresentationPanel />
      <Link to="/" className={`btn ${canIssue ? 'btn-primary' : 'btn-secondary'} btn-block`}>
        {canIssue ? 'Empezar a facturar' : 'Continuar sin firmar por ahora'}
      </Link>
    </AccessLayout>
  );
}
