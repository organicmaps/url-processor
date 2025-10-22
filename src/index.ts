import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';
import { onGe0Decode } from './ge0';

const NOT_FOUND_REDIRECT_URL = 'https://organicmaps.app';
const GE0_TEMPLATE_PATH = '/ge0.html';
const APPSTORE = 'https://apps.apple.com/app/organic-maps/id1567437057';
const GOOGLE = 'https://play.google.com/store/apps/details?id=app.organicmaps';
const HUAWEI = 'https://appgallery.huawei.com/#/app/C104325611';
const FDROID = 'https://f-droid.org/en/packages/app.organicmaps/';
const OMAPS_REWRITE_RULES: Record<string, string> = {
  '/api': '/test.html',
  '/apple-touch-icon.png': '/icons/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png': '/icons/apple-touch-icon.png',
  '/apple-app-site-association': '/apple-app-site-association.json',
  // Hidden files and symlinks are not uploaded by wrangler.
  // See https://developers.cloudflare.com/workers/cli-wrangler/configuration#default-ignored-entries
  '/.well-known/apple-app-site-association': '/apple-app-site-association.json',
  '/.well-known/assetlinks.json': '/assetlinks.json',
  '/': '/get.html',
  '/app': '/get.html',
  '/beta': '/beta.html',
  '/get': '/get.html',
  '/im_get': '/get.html',
  '/install': '/get.html',
  '/f': FDROID,
  '/fd': FDROID,
  '/fdroid': FDROID,
  '/g': GOOGLE,
  '/gp': GOOGLE,
  '/google': GOOGLE,
  '/googleplay': GOOGLE,
  '/h': HUAWEI,
  '/hw': HUAWEI,
  '/huawei': HUAWEI,
  '/i': APPSTORE,
  '/ios': APPSTORE,
  '/iphone': APPSTORE,
  '/ipad': APPSTORE,
  '/ipod': APPSTORE,
  '/matrix': 'https://matrix.to/#/#organicmaps:matrix.org',
  '/news': 'https://organicmaps.app/news',
  '/tr/news': 'https://organicmaps.app/tr/news',
  '/test': '/test.html',
  '/test/': '/test.html',
};

addEventListener('fetch', (event) => {
  try {
    event.respondWith(handleFetchEvent(event));
  } catch (e: any) {
    if (DEBUG) {
      event.respondWith(new Response(e.message || e.toString(), { status: 500 }));
    } else {
      // In case of unexpected errors, always redirect to the default url.
      event.respondWith(Response.redirect(NOT_FOUND_REDIRECT_URL, 302));
    }
  }
});

async function handleFetchEvent(event: FetchEvent) {
  const { hostname, pathname } = new URL(event.request.url);

  // First, process all known redirects.
  if ((DEBUG || hostname === 'omaps.app') && pathname in OMAPS_REWRITE_RULES) {
    if (OMAPS_REWRITE_RULES[pathname].startsWith('http')) return Response.redirect(OMAPS_REWRITE_RULES[pathname], 302);
  }

  // See https://github.com/cloudflare/kv-asset-handler#optional-arguments
  const getAssetOptions = {
    cacheControl: { bypassCache: DEBUG },
    mapRequestToAsset: (request: Request) => {
      if ((DEBUG || hostname === 'omaps.app') && pathname in OMAPS_REWRITE_RULES) {
        const url = new URL(request.url);
        url.pathname = OMAPS_REWRITE_RULES[pathname];
        request = new Request(url.toString(), request);
      }
      return mapRequestToAsset(request);
    },
  };

  // Try to return a static resource first.
  try {
    return await getAssetFromKV(event, getAssetOptions);
  } catch (_) {}
  // No static resource were found, try to handle a specific dynamic request.
  getAssetOptions.mapRequestToAsset = (request: Request) => {
    const url = new URL(request.url);
    url.pathname = GE0_TEMPLATE_PATH;
    return mapRequestToAsset(new Request(url.toString(), request));
  };
  const resp = await getAssetFromKV(event, getAssetOptions);
  const ge0HtmlTemplate = await resp.text();
  try {
    // await to catch exceptions.
    const htmlResponse = await onGe0Decode(ge0HtmlTemplate, event.request.url);
    return htmlResponse;
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}
