# Static resources and short links (ge0) decoder for Organic Maps

Root domain redirects to https://organicmaps.app/.

URLs like `http(s)://omaps.app/ENCODEDCOORDINATES/PINNAME` are decoded to lat, lon and zoom level. Then the OSM
map is displayed and url schemes are opened on mobile apps.

Add some query parameters to test:

- For dev environment:
  - [http](http://url-processor.omaps.workers.dev/B4srhdHVVt/Some+Name)
  - [https](https://url-processor.omaps.workers.dev/B4srhdHVVt/Some+Name)
  - [http ru](http://url-processor.omaps.workers.dev/AwAAAAAAAA/%d0%9c%d0%b8%d0%bd%d1%81%d0%ba_%d1%83%d0%bb._%d0%9b%d0%b5%d0%bd%d0%b8%d0%bd%d0%b0_9)
  - [https ru](https://url-processor.omaps.workers.dev/AwAAAAAAAA/%d0%9c%d0%b8%d0%bd%d1%81%d0%ba_%d1%83%d0%bb._%d0%9b%d0%b5%d0%bd%d0%b8%d0%bd%d0%b0_9)
- For prod environment:
  - [http](http://omaps.app/B4srhdHVVt/Some+Name)
  - [https](https://omaps.app/B4srhdHVVt/Some+Name)
  - [http ru](http://omaps.app/AwAAAAAAAA/%d0%9c%d0%b8%d0%bd%d1%81%d0%ba_%d1%83%d0%bb._%d0%9b%d0%b5%d0%bd%d0%b8%d0%bd%d0%b0_9)
  - [https ru](https://omaps.app/AwAAAAAAAA/%d0%9c%d0%b8%d0%bd%d1%81%d0%ba_%d1%83%d0%bb._%d0%9b%d0%b5%d0%bd%d0%b8%d0%bd%d0%b0_9)

[![Deploy master to Production](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/organicmaps/url-processor)

## Requirements

Install CloudFlare's wrangler and other dev dependencies using npm:

```bash
npm i
```

## Development

Use `npx wrangler dev` for localhost development.

## Preview on workers.dev

Use `npx wrangler preview` to open and test deployed worker in browser.

## Deployment

All pushes to master automatically deploy dev version to https://url-processor.omaps.workers.dev/

Deploy to prod manually using `npx wrangler publish --env omaps` or this
[action](https://github.com/organicmaps/url-processor/actions/workflows/deploy-master-to-prod.yml).

## Known issues

- Hidden directories and symlinks in worker site assets are ignored by wrangler.
- Cloudflare's free Flexible SSL certificates does not support 4-th level
  subdomains like a.b.example.com, so you can see strange SSL errors.
- HTTPS `fetch` requests from Workers are converted to HTTP ones if the target
  host is in the same Cloudflare zone, see [here](https://community.cloudflare.com/t/does-cloudflare-worker-allow-secure-https-connection-to-fetch-even-on-flexible-ssl/68051/12)
  for more details.
