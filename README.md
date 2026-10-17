# Save From Brobex

Premium red/black/gold React + TypeScript starter with an Express API. This project is intentionally transparent about integrations that are not configured: it validates selected public-source URLs, but it does **not** fetch third-party pages, extract media, fabricate metadata, or create download links.

## Environment inspection

The project was created from scratch because no existing source archive was attached. The available build environment reported Node.js `v22.16.0` and npm `10.9.2`. Dependency installation did not finish in the isolated authoring environment, so a successful production build cannot be claimed here.

## Features implemented

- React, TypeScript, Vite, Tailwind CSS v4, React Router, Lucide React, Framer Motion.
- Responsive red/black/gold visual system, mobile navigation, reduced-motion support, focus styles, and semantic page structure.
- Homepage URL field with Enter submission, paste/clear actions, frontend validation, backend validation, loading state, and honest unsupported-integration feedback.
- URL validation restricted to selected hostnames; the backend does not fetch submitted URLs, preventing arbitrary URL fetch/redirect SSRF in this baseline.
- In-memory per-IP rate limiting for API routes, JSON size limit, timeouts are not needed for third-party fetching because none is performed.
- Blog listing, featured article, four original articles, article routes, About, Contact, Privacy, Terms, and branded not-found route.
- Contact form validation; API explicitly reports delivery is not configured and does not claim to send or store a message.
- SEO title/description updates, basic Open Graph tags, robots.txt and sitemap template.

## Not implemented / external integration required

- No media metadata or download provider is configured. `/api/media/resolve` intentionally responds with HTTP 501 after validation. Before enabling a provider, review its authorization, terms, security, API contract, and file-delivery method.
- No email delivery provider is configured. `/api/contact` intentionally responds with HTTP 503; users are directed to `brobex.ffx@gmail.com`.
- No persistent database, analytics, cookies, or media storage is included.
- Sitemap canonical host is a placeholder and must be replaced with the production domain.
- Production legal policies are drafts and must be reconciled with the real hosting/provider/log-retention practices and reviewed for the relevant jurisdiction.

## Install and run locally

Requires Node.js 22+ and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. Vite serves the frontend; the API server runs on `http://localhost:8787`. Configure a local proxy or use the provided Vite config extension below if you want browser requests from Vite to reach Express. In this starter, add the `server.proxy` setting to `vite.config.ts`:

```ts
server: {
  port: 5173,
  proxy: { '/api': 'http://localhost:8787' }
}
```

`CLIENT_ORIGIN` should match the frontend origin. The default is `http://localhost:5173`.

## Build and test

```bash
npm run typecheck
npm run build
npm run start
```

For the production API/static-server mode, set `NODE_ENV=production`, build first, and configure `PORT` and `CLIENT_ORIGIN`. The Express server serves `dist` and returns HTTP 404 for unknown paths. On a static-only host, unknown routes may return the host's default status unless that host supports custom 404 behavior; use the platform's routing/status configuration to preserve a real 404.

## Deployment

A single Node-capable host can serve the API and built frontend. Configure environment variables in the hosting dashboard, set `NODE_ENV=production`, and run `npm run build` followed by `npm run start`. Do not commit `.env`. If deploying frontend and API separately, set Vite's `/api` proxy for development and configure the production API base URL and CORS origin explicitly.

## Security notes before production

- The resolver never makes outbound requests to submitted URLs. Do not add arbitrary `fetch(url)` behavior. For any future provider, use a fixed, reviewed provider endpoint rather than fetching arbitrary user-supplied destinations.
- The in-memory rate limiter is per process and resets on restart; replace it with a shared limiter for multi-instance production.
- Add a delivery provider and abuse controls before enabling contact submissions. Consider honeypot/CSRF controls appropriate to the deployment.
- Add automated tests, monitoring, dependency updates, and a real production-domain canonical/sitemap before launch.
