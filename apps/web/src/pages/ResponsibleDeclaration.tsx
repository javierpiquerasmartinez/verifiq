import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AccessLayout } from '../ui/components';

/**
 * The producer's responsible declaration (RRSIF art. 13, Orden HAC/1177/2024 art. 15), with its
 * fields in the order the Orden sets. Its text is the operator's; the version is the build's. A new
 * text keeps the previous one on record (RRSIF art. 13.3: through git history).
 */
const DECLARATION = {
  producer: {
    name: 'Francisco Javier Piqueras Martinez',
    taxId: '48413846L',
    address: 'C/ Poeta Ricard Sanmarti 4, 12, 46020 Valencia',
  },
  /** IdSistemaInformatico. Pending: how Verifacti identifies Verifiq in the records it sends. */
  systemId: null as string | null,
  /** The version of Verifacti that Verifiq invokes. Pending: Verifacti publishes it with its own declaration. */
  connectorVersion: null as string | null,
  signedIn: 'Valencia',
  signedOn: '8 de octubre de 2026',
};

const PENDING = 'Pendiente de confirmar con Verifacti';

function Item({ letter, label, children }: { letter: string; label: string; children: ReactNode }) {
  return (
    <>
      <dt>
        {letter}) {label}
      </dt>
      <dd>{children}</dd>
    </>
  );
}

/** Public: linked from the footer of every page and from the settings. */
export function ResponsibleDeclarationPage() {
  const { producer } = DECLARATION;
  return (
    <AccessLayout
      wide="wider"
      title="Declaración responsable del sistema informático de facturación"
      footer={
        <Link className="lnk" to="/">
          Volver a Verifiq
        </Link>
      }
    >
      <dl className="stack declaration">
        <Item letter="a" label="Nombre del sistema informático">
          Verifiq
        </Item>
        <Item letter="b" label="Código identificador del sistema">
          {DECLARATION.systemId ?? PENDING}
        </Item>
        <Item letter="c" label="Versión">
          <span className="mono">{__APP_VERSION__}</span>
        </Item>
        <Item letter="d" label="Componentes y funcionalidades">
          <p>
            Verifiq es un servicio en línea de facturación para profesionales autónomos. Permite preparar y emitir
            facturas completas y rectificativas, numerarlas de forma correlativa en series propias, anularlas, y
            generar su PDF con el código QR tributario.
          </p>
          <p>
            Para registrar las facturas en la AEAT, Verifiq invoca de forma indefectible e inmediata, y sin alterar
            los datos que le entrega, el componente de facturación <b>Verifacti</b> (versión{' '}
            {DECLARATION.connectorVersion ?? 'pendiente de confirmar con Verifacti'}), que genera, encadena y remite a la AEAT los
            registros de facturación de alta y de anulación de cada factura. Verifiq se coordina con él en las
            respuestas de la AEAT (rechazos, subsanaciones, rectificativas y anulaciones): no hay facturas sin
            registro ni registros sin factura. Verifacti publica su propia declaración responsable.
          </p>
        </Item>
        <Item letter="e" label="Funciona exclusivamente como VERI*FACTU">
          Sí.
        </Item>
        <Item letter="f" label="Permite su uso por varios obligados tributarios">
          Sí. Cada obligado tributario usa el sistema de forma independiente, con sus propios registros, y el
          sistema muestra en todo momento en nombre de qué obligado se actúa.
        </Item>
        <Item letter="g" label="Tipos de firma">
          No aplica: el sistema funciona como VERI*FACTU.
        </Item>
        <Item letter="h" label="Productor">
          {producer.name}
        </Item>
        <Item letter="i" label="NIF del productor">
          <span className="mono">{producer.taxId}</span>
        </Item>
        <Item letter="j" label="Dirección postal">
          {producer.address}
        </Item>
        <Item letter="k" label="Declaración">
          El productor declara que el sistema informático de facturación Verifiq, en la versión indicada, cumple con
          lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria, en el
          Reglamento aprobado por el Real Decreto 1007/2023, de 5 de diciembre, y en la Orden HAC/1177/2024, de 17
          de octubre.
        </Item>
        <Item letter="l" label="Fecha y lugar">
          En {DECLARATION.signedIn}, a {DECLARATION.signedOn}.
        </Item>
      </dl>
    </AccessLayout>
  );
}
