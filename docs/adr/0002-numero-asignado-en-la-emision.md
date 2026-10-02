# El número de factura se asigna en la Emisión, no al crear el Borrador

La numeración debe ser correlativa por Serie y un número nunca puede reutilizarse ante la AEAT. Si los Borradores tuvieran número, borrarlos dejaría huecos. Por eso los Borradores no tienen número y la Emisión lo asigna atómicamente (bloqueo por Serie en Postgres) en la misma transacción que crea el Registro de facturación.
