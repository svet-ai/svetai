# SVET AI — Қазақ тілі мен әдебиеті әлемі

Responsive teacher studio with Kazakh, Russian and English interface, React + TypeScript, a Cloudflare Worker API and persistent D1 database.

## Included
- Responsive dashboard, light/dark/system appearance, search and grade/subject/type filters.
- Admin-only account provisioning, username/password changes, deletion, and content moderation. No public sign-up route.
- PBKDF2 password hashes, HttpOnly/Secure cookies, server-enforced roles, login throttling, session revocation after credential changes, same-origin mutation checks.
- Editable structured templates for ҚМЖ, БЖБ, ТЖБ, worksheets, presentations, essays, research projects, articles, class meetings, scripts, open lessons, PISA tasks, infographic text and comic scripts.
- Optional real text generation through the server-side `OPENAI_API_KEY` secret. The interface explicitly indicates when AI is not configured. Templates do not claim to generate verified subject-specific content from an arbitrary topic.
- DOCX, TXT and presentation PPTX exports. PDF uses the browser print dialog; choose “Save as PDF”.
- Private collections, Word/PDF/PPTX uploads up to 1 MB, teacher publication requests and admin approval.
- Anonymous browser-local QR creation and PNG/SVG download. Platform hosting permissions are independent from application account permissions.
- Quiz, matching, flashcards, true/false, answer explanations, printable cards, downloadable standalone offline quiz.
- Random group maker, timer, device-local reflection collection.
- Browser text-to-speech and SVG initial avatar. AI image, talking avatar and AI voice integrations are not connected. Comic and infographic generators currently produce text structures, not image assets.
- Six labelled Kazakh sample educational materials. Curriculum codes and arbitrary topic-specific answer keys must be supplied or checked by the teacher. UI and templates support three languages; sample Kazakh subject texts are intentionally in Kazakh.

## Development
Node 24+ required (development uses built-in SQLite).

```sh
npm ci
node scripts/dev-server.mjs
```
Open the printed `http://127.0.0.1:5173` URL. The local-only preview admin is `admin@svetai.kz` with password `preview-password-only`; these credentials never apply in production. Local database and uploads live in ignored `work/dev.sqlite`.

```sh
npm run check
node tests/server.test.mjs
npm run build
```

The build embeds Vite assets in a self-contained ES module Worker at `dist/server/index.js` and copies the hosting manifest and schema migrations. No secret is embedded in the build. The bundled frontend loads DOCX/PPTX libraries on demand.

## Production configuration
- Bind Cloudflare D1 as `DB` and apply the generated immutable SQL migrations in `drizzle/` before serving API traffic.
- Set `ADMIN_INITIAL_PASSWORD` as a server-side secret before first login. The admin login starts as `admin@svetai.kz`; the configured password is hashed and used only when no administrator exists. Change it in Settings after initial login. Never commit production secret values.
- Optionally set `OPENAI_API_KEY` as a server-side secret to enable actual AI text generation. Without it, the site uses clearly labelled templates.
- Deploy the archive through Sites. The managed environment did not contain the Sites starter or workflow helpers, so the implementation uses a standalone Worker and deterministic build instead of those missing helper files.
- Guest access to QR requires a public hosting audience in addition to no application login. Public hosting requires owner approval; no application feature bypasses the hosting boundary.

WhatsApp account requests open `https://wa.me/77074829886` with a prefilled message. No messages are sent automatically.

## Validation
TypeScript, production build, account/authorization/persistence/session tests, CSRF-origin rejection, login throttling, browser flows for anonymous QR, games, admin account creation, material save, mobile layout and dark mode. Local preview data is separate from production.

The administrator can download the full source ZIP from the admin panel. Production source downloads require an admin session.

## Vercel: svet-ai.vercel.app

`vercel.json`, `api/index.mjs` and `npm run build:vercel` support a separate Vercel deployment. This does not proxy or bypass the private Sites deployment. Vercel uses its own durable SQLite-compatible Turso/libSQL database.

1. Connect the Vercel account and select the project that owns `svet-ai.vercel.app`. A hostname cannot be claimed by changing source text.
2. Provision a Turso/libSQL database and securely set Vercel environment variables `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_INITIAL_PASSWORD`. Optionally add `OPENAI_API_KEY` for actual AI generation. Never put these values in Git or chat.
3. Import the source as a Vercel project. The build applies tracked schema migrations, builds the frontend and enables the serverless API.
4. Confirm the deployment and domain assignment in Vercel. This repository alone is not proof that the requested Vercel hostname has been deployed.

The Vercel build deliberately fails if the database is not configured, to prevent publishing an application whose login and storage do not work. Sites and Vercel use separate databases and admin initialization. Do not share their session or hosting service credentials.
