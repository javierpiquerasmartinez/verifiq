import { z } from 'zod';

/** Closed catalogue of Supuestos de exención (art. 20 LIVA) the product supports. */
export const SUPUESTO_EXENCION_IDS = ['odontologia'] as const;

export type SupuestoExencionId = (typeof SUPUESTO_EXENCION_IDS)[number];

export const supuestoExencionSchema = z.enum(SUPUESTO_EXENCION_IDS);

export interface SupuestoExencion {
  /** Shown when picking the Supuesto de exención for a line. */
  label: string;
  /** Legal mention printed on the invoice. */
  mention: string;
  /** Exemption code sent to VeriFactu; the MVP only supports art. 20 exemptions. */
  verifactuCode: 'E1';
}

const SUPUESTOS_EXENCION: Record<SupuestoExencionId, SupuestoExencion> = {
  odontologia: {
    label: 'Servicios sanitarios — odontología (art. 20.Uno.5º LIVA)',
    mention:
      'Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.',
    verifactuCode: 'E1',
  },
};

export function supuestoExencion(id: SupuestoExencionId): SupuestoExencion {
  return SUPUESTOS_EXENCION[id];
}
