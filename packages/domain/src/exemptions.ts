import { z } from 'zod';

/**
 * Closed catalogue of exemption grounds (art. 20.Uno of the Spanish VAT Act) the product supports.
 * The last one is generic: the mention may just say the operation is exempt (ROF art. 6.1.j).
 */
export const EXEMPTION_GROUND_IDS = [
  'healthcare',
  'dentistry',
  'education',
  'privateTuition',
  'insuranceMediation',
  'authorsAndArtists',
  'otherArticle20',
] as const;

export type ExemptionGroundId = (typeof EXEMPTION_GROUND_IDS)[number];

export const exemptionGroundSchema = z.enum(EXEMPTION_GROUND_IDS);

/** VeriFactu's codes for exempt operations; E1 is art. 20 of the VAT Act. */
export type VerifactuExemptionCode = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';

export interface ExemptionGround {
  /** Shown when picking the exemption ground for a line. */
  label: string;
  /** Legal mention printed on the invoice. */
  mention: string;
  /** What the services are called in the prefilled Operation Description of an invoice. */
  services: string;
  /** Shown under the picker while this ground is chosen. */
  help?: string;
  /** Exemption code sent to VeriFactu; every ground in the catalogue is an art. 20 exemption for now. */
  verifactuCode: VerifactuExemptionCode;
}

const mentionOf = (precept: string) =>
  `Operación exenta de IVA en virtud del ${precept} de la Ley 37/1992, del Impuesto sobre el Valor Añadido.`;

const EXEMPTION_GROUNDS: Record<ExemptionGroundId, ExemptionGround> = {
  healthcare: {
    label:
      'Asistencia sanitaria: médicos, fisioterapeutas, psicólogos, enfermería, podólogos, ópticos, logopedas… (art. 20.Uno.3º LIVA)',
    mention: mentionOf('artículo 20.Uno.3º'),
    services: 'Servicios sanitarios',
    verifactuCode: 'E1',
  },
  dentistry: {
    label: 'Odontología y estomatología (art. 20.Uno.5º LIVA)',
    mention: mentionOf('artículo 20.Uno.5º'),
    services: 'Servicios odontológicos',
    verifactuCode: 'E1',
  },
  education: {
    label: 'Enseñanza reglada en un centro autorizado (art. 20.Uno.9º LIVA)',
    mention: mentionOf('artículo 20.Uno.9º'),
    services: 'Servicios de enseñanza',
    verifactuCode: 'E1',
  },
  privateTuition: {
    label: 'Clases particulares de materias de los planes de estudios (art. 20.Uno.10º LIVA)',
    mention: mentionOf('artículo 20.Uno.10º'),
    services: 'Clases particulares',
    verifactuCode: 'E1',
  },
  insuranceMediation: {
    label: 'Mediación de seguros (art. 20.Uno.16º LIVA)',
    mention: mentionOf('artículo 20.Uno.16º'),
    services: 'Servicios de mediación de seguros',
    verifactuCode: 'E1',
  },
  authorsAndArtists: {
    label: 'Autores, artistas, traductores y colaboradores literarios (art. 20.Uno.26º LIVA)',
    mention: mentionOf('artículo 20.Uno.26º'),
    services: 'Servicios profesionales',
    verifactuCode: 'E1',
  },
  otherArticle20: {
    label: 'Otra exención del art. 20 LIVA',
    mention: mentionOf('artículo 20'),
    services: 'Servicios profesionales',
    help: 'Solo para exenciones del artículo 20. Las facturas a clientes extranjeros todavía no están disponibles en Verifiq.',
    verifactuCode: 'E1',
  },
};

export function exemptionGround(id: ExemptionGroundId): ExemptionGround {
  return EXEMPTION_GROUNDS[id];
}
