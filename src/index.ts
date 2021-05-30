import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';
import { onGe0Decode } from './ge0';

const NOT_FOUND_REDIRECT_URL = 'https://organicmaps.app/';
const GE0_TEMPLATE_URL = '/ge0.html';

addEventListener('fetch', (event) => {
  try {
    event.respondWith(handleFetchEvent(event));
  } catch (e) {
    if (DEBUG) {
      event.respondWith(new Response(e.message || e.toString(), { status: 500 }));
    } else {
      // In case of unexpected errors, always redirect to the default url.
      event.respondWith(onRedirect(NOT_FOUND_REDIRECT_URL));
    }
  }
});

async function handleFetchEvent(event: FetchEvent) {
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
  const { pathname } = new URL(event.request.url);
  // Filter empty pathname elements.
  const params = pathname.split('/').filter(Boolean);
  if (params.length === 0) return onRedirect(NOT_FOUND_REDIRECT_URL);

  getAssetOptions.mapRequestToAsset = (request: Request) => {
    const url = new URL(request.url);
    url.pathname = GE0_TEMPLATE_URL;
    return mapRequestToAsset(new Request(url.toString(), request));
  };
  const resp = await getAssetFromKV(event, getAssetOptions);
  const ge0HtmlTemplate = await resp.text();
  return onGe0Decode(ge0HtmlTemplate, params[0], params.length >= 2 ? params[1] : undefined);
}

function onRedirect(url: string) {
  return Response.redirect(url, 301);
}
