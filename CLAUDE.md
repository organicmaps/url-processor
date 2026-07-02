This file provides guidance to AI agents when working with code in this repository.

## What this is

A single Cloudflare Worker that backs the `omaps.app` domain for Organic Maps. It does three things, in priority order per request:

1. **Redirects** — short vanity paths (`/g` → Google Play, `/ios` → App Store, `/.well-known/*` → association files, etc.).
2. **Static assets** — serves everything under `public/` (install pages, app-association JSON, placemark icons).
3. **ge0 short-link decoding** — turns `omaps.app/ENCODEDCOORDS/PinName` into lat/lon/zoom and renders an OSM map page that deep-links into the mobile app via the `om:/` URL scheme.

## Commands

```bash
npm i                       # install (also pulls wrangler)
npx wrangler dev            # local dev server (DEBUG=true)
npm run build               # esbuild bundles src/index.ts -> workers-site/index.js
npm test                    # jest (TS compiled via test/esbuild-transform.cjs)
npx jest -t 'zoom'          # run a single test by name substring
npm run lint                # eslint src + tsc --noEmit (type-check only)
npm run format              # prettier over src/**/*.{ts,tsx,json} and public/*.json
npm run upgrade             # npm-check-updates -u && npm install
npx wrangler deploy --env omaps   # manual prod deploy (README shows the older `publish`)
```

## Testing

`npm test` runs Jest. TypeScript is transpiled by a tiny esbuild-based transformer (`test/esbuild-transform.cjs`, wired via `jest.config.js`) — the same bundler as the production build, so there is **no ts-jest/babel dependency** to keep in sync with TypeScript (the repo is on TS 6 / ESLint 10, and ts-jest tends to lag TypeScript majors). Tests live in `test/*.test.ts` and import straight from `src/`.

`test/api.test.ts` covers the pure units — `decodeLatLonZoom`, `normalizeZoom`, `normalizeNameAndTitle` (including the Windows-1251 fallback), `CLEAR_COORDINATES_REGEX` — plus `onGe0Decode` end-to-end (encoded + clear-text paths, HTML-escaping, out-of-range rejection). To test a new helper, **`export` it from `src/ge0.ts`** — only exported symbols are reachable from tests. Run one test with `npx jest -t '<name substring>'`.

`npm run lint` (ESLint over `src/` + `tsc --noEmit`) is expected to pass — **CI runs it on PRs** — so treat a lint failure as a real regression, not pre-existing noise.

## Request pipeline — `src/index.ts`

`handleFetchEvent` runs on every request:

1. If the path is in `OMAPS_REWRITE_RULES` **and** its value starts with `http`, return a `302` redirect.
2. Otherwise try `getAssetFromKV` (static file from `public/`). `OMAPS_REWRITE_RULES` values that are *paths* (e.g. `/` → `/get.html`, `/.well-known/apple-app-site-association` → `/apple-app-site-association.json`) are applied here as internal rewrites via `mapRequestToAsset`.
3. If no asset matches, fall through to the ge0 decoder: load the `/ge0.html` template and call `onGe0Decode(template, url)`.

The `.well-known/*` rewrite rules exist because **wrangler does not upload hidden directories or symlinks** to the asset bucket, so those paths are mirrored to non-hidden copies in `public/`.

## ge0 decoding — `src/ge0.ts`

`onGe0Decode` has two decode paths:

- **Clear-text coordinates** — if the path matches `CLEAR_COORDINATES_REGEX` (literal `lat`/`lon`/`zoom`/`name` in the URL), use those directly.
- **Encoded ge0** — otherwise `decodeLatLonZoom` runs the Organic Maps ge0 algorithm: first char encodes zoom, remaining chars pack interleaved lat/lon bits decoded through the `base64Reverse` lookup table (Organic Maps' custom base64 alphabet, `-` and `_` for the last two symbols). This mirrors the C++ decoder in the main organicmaps repo — keep it bit-for-bit compatible.

Both paths then:
- Normalize the pin name (`normalizeNameAndTitle`): `+`/`_` → space, `decodeURIComponent`, with a **Windows-1251 fallback** for malformed encodings (vk.com mangles some shared links), falling back to `😃`.
- Escape output with `encodeHTML` (XSS prevention) before injecting.
- Fill template tokens in `public/ge0.html` via `replaceInTemplate`. Use context-specific escaped tokens: `${name}` for HTML, `${nameJs}` for JavaScript strings, `${appUriAttr}` for HTML attributes, and `${appUriJs}` for JavaScript strings. If you add a token in the HTML, it silently renders empty unless you pass it here.

Coordinates outside valid lat/lon ranges throw; the caller turns a throw into a 500 (dev) or a redirect to `organicmaps.app` (prod).

## The DEBUG flag & environments

`DEBUG` is a Worker var set in `wrangler.toml`, and it changes behavior in two important ways:

| | dev (default env) | prod (`env.omaps`) |
|---|---|---|
| `DEBUG` | `true` | `false` |
| Redirect/rewrite rules | apply on **any** hostname | apply **only** when `hostname === 'omaps.app'` |
| Errors | return the real message as `500` | redirect to `https://organicmaps.app` |
| Asset cache | bypassed | normal CF caching |
| Worker name / route | `url-processor` on `*.workers.dev` | `url-processor-omaps` on `omaps.app/*` |

So a rewrite rule you add will "work everywhere" in dev but only fire on `omaps.app` in prod — test with the real host in mind.

## Build & deploy

- `workers-site/index.js` is the **esbuild output and is gitignored** — never edit it by hand; edit `src/` and rebuild. `wrangler.toml`'s `[build]` step runs `npm run build` automatically on deploy.
- Pushing to `master` triggers `.github/workflows/deploy-master-to-prod.yml`, which deploys the **`omaps` (production)** environment via `cloudflare/wrangler-action`.
- CI (`.github/workflows/check.yml`) runs on PRs with **Node 24** (matching `.nvmrc`) and runs `npm run format`, `npm run lint`, `npm run build`, then `npm test`.
