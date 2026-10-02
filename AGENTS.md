## Agent skills

### Issue tracker

Las issues viven como ficheros markdown en `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Las cinco etiquetas por defecto (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: un `GLOSSARY.md` y `docs/adr/` en la raíz. See `docs/agents/domain.md`.

### Language

Everything in the code is in English: identifiers, comments, test names, routes (API and web), database tables and columns, commit messages, branch names, PR titles and descriptions, and the README. Domain terms use the English code name that `GLOSSARY.md` gives each one (e.g. Emisor → `Issuer`, Destinatario → `Recipient`, Borrador → `Draft`); never a Spanish name or another synonym. Only user-facing copy (UI text, emails, validation messages shown to users) stays in Spanish. Specs, ADRs, issues and `GLOSSARY.md` stay in Spanish.
