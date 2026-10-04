import type { CensusStatus } from '@verifiq/domain';
import { Icon } from './icons';

/** Whether the AEAT census confirmed the recipient's tax ID. */
export function CensusTag({ status }: { status: CensusStatus }) {
  return status === 'identified' ? (
    <span className="tag tag-ok">
      <Icon name="shield" size="xs" />
      NIF verificado
    </span>
  ) : (
    <span className="tag tag-warn">
      <Icon name="alert" size="xs" />
      NIF sin comprobar
    </span>
  );
}
