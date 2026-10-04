import { z } from 'zod';

/** Closed catalogue of exemption grounds (art. 20 of the Spanish VAT Act) the product supports. */
export const EXEMPTION_GROUND_IDS = ['dentistry'] as const;

export type ExemptionGroundId = (typeof EXEMPTION_GROUND_IDS)[number];

export const exemptionGroundSchema = z.enum(EXEMPTION_GROUND_IDS);

export interface ExemptionGround {
  /** Shown when picking the exemption ground for a line. */
  label: string;
  /** Legal mention printed on the invoice. */
  mention: string;
  /** What the services are called in the prefilled Operation Description of an invoice. */
  services: string;
  /** Exemption code sent to VeriFactu; the MVP only supports art. 20 exemptions. */
  verifactuCode: 'E1';
}

const EXEMPTION_GROUNDS: Record<ExemptionGroundId, ExemptionGround> = {
  dentistry: {
    label: 'Servicios sanitarios — odontología (art. 20.Uno.5º LIVA)',
    mention:
      'Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.',
    services: 'Servicios odontológicos',
    verifactuCode: 'E1',
  },
};

export function exemptionGround(id: ExemptionGroundId): ExemptionGround {
  return EXEMPTION_GROUNDS[id];
}
