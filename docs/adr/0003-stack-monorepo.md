# Monorepo pnpm con React (Vite) + NestJS + Drizzle sobre Neon

pnpm workspaces + Turborepo: `apps/web` (React + Vite, sin SSR: es una app privada), `apps/api` (NestJS, cuya DI facilita aislar el conector VeriFactu) y `packages/domain` (cálculo de importes en decimal, validación de NIF y schemas zod compartidos). Elegimos Drizzle frente a Prisma por el control explícito de SQL y transacciones (`SELECT … FOR UPDATE` para la numeración), tipos `numeric` sin sorpresas, migraciones SQL revisables y buen encaje con el driver de Neon. Autenticación con Better Auth embebido (datos en nuestra Postgres en la UE).

Despliegue en la UE: Neon (Frankfurt) para Postgres, Render (Frankfurt) para la API y el worker, Vercel para la web estática.
