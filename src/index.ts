import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';
import { onGe0Decode } from './ge0';

const NOT_FOUND_REDIRECT_URL = 'https://organicmaps.app';
const GE0_TEMPLATE_URL = '/ge0.html';

addEventListener('fetch', (event) => {
  try {
    event.respondWith(handleFetchEvent(event));
  } catch (e) {
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
  if (hostname === 'omaps.app' && pathname === '/')
    return Response.redirect(NOT_FOUND_REDIRECT_URL, 301);

  // See https://github.com/cloudflare/kv-asset-handler#optional-arguments
  const getAssetOptions: {
    cacheControl?: { bypassCache: boolean };
    mapRequestToAsset?: (_: Request) => Request;
  } = {};

  if (DEBUG) {
    // Disable caching in debug.
    getAssetOptions.cacheControl = { bypassCache: true };
  }

  // Try to return a static resource first.
  try {
    return await getAssetFromKV(event, getAssetOptions);
  } catch (_) { }
  // No static resource were found, try to handle a specific dynamic request.
  // Filter empty pathname elements.
  const params = pathname.split('/').filter(Boolean);

  getAssetOptions.mapRequestToAsset = (request: Request) => {
    const url = new URL(request.url);
    url.pathname = GE0_TEMPLATE_URL;
    return mapRequestToAsset(new Request(url.toString(), request));
  };
  const resp = await getAssetFromKV(event, getAssetOptions);
  const ge0HtmlTemplate = await resp.text();
  return onGe0Decode(ge0HtmlTemplate, params[0], params.length >= 2 ? params[1] : undefined);
}
