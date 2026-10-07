declare type LatLonZoom = {
  lat: number;
  lon: number;
  zoom: number;
};

function replaceInTemplate(template: string, data: Record<string, string | number>) {
  const pattern = /\${\s*(\w+?)\s*}/g;
  return template.replace(pattern, (_, token) => String(data[token] ?? ''));
}

function fromWindows1251(percentEncoded: string) {
  const decoder = new TextDecoder('windows-1251', { fatal: true, ignoreBOM: false });
  // https://stackoverflow.com/a/69769015
  return percentEncoded.replace(/(?:%[0-9A-F]{2})+/g, (s) =>
    decoder.decode(Uint8Array.from(s.replaceAll('%', ',0x').slice(1).split(','), (h) => Number(h))),
  );
}

const kSharedViaOM = 'Shared via <a href="https://organicmaps.app">Organic Maps</a>';

export function normalizeNameAndTitle(name: string | undefined): [string, string] {
  let title = 'Organic Maps';
  if (name) {
    name = name.replace(/\+|_/g, ' '); // Convert underscores back to spaces.
    try {
      name = decodeURIComponent(name);
    } catch {
      try {
        // There are some cases when coordinates are correct, but the name is not encoded properly, for example:
        // %DF%F0%EA%EE%E2%F1%EA%EE%E5_%F3%F7%E0%F1%F2%EA%EE%E2%EE%E5_%EB%E5%F1%ED%E8%F7%E5%F1%F2%E2%EE
        // %C8%EB%EE%E2%E0%E9%F1%EA%EE%E5_%F3%F7%E0%F1%F2%EA%EE%E2%EE%E5_%EB%E5%F1%ED%E8%F7%E5%F1%F2%E2%EE
        // Looks like vk.com incorrectly uses Windows-1251 to encode some shared links when querying previews.
        name = fromWindows1251(name);
      } catch {
        name = '😃';
      }
    }
    title = name + ' | ' + title;
  } else {
    name = kSharedViaOM;
  }
  return [name, title];
}

export function normalizeZoom(zoom: string | null | undefined): number {
  const DEFAULT_ZOOM = 14;
  // Clamp a shared zoom to a sane range; out-of-range or non-numeric values fall back to the default.
  const MAX_ZOOM = 20;
  if (!zoom || !/^\d+$/.test(zoom)) return DEFAULT_ZOOM;
  const z = Number(zoom);
  if (z < 1 || z > MAX_ZOOM) return DEFAULT_ZOOM;
  return z;
}

const htmlEntityCode: Record<string, string> = {
  ' ': '&nbsp;',
  '¢': '&cent;',
  '£': '&pound;',
  '¥': '&yen;',
  '€': '&euro;',
  '©': '&copy;',
  '®': '&reg;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '&': '&amp;',
  "'": '&apos;',
};

function encodeHTML(str: string) {
  return str.replace(/[ ¢£¥€©®<>\&'"]/gm, (i) => htmlEntityCode[i]);
}

function encodeJavaScriptString(str: string) {
  return JSON.stringify(str).replace(/[<>&\u2028\u2029]/g, (char) => {
    switch (char) {
      case '<':
        return '\\u003C';
      case '>':
        return '\\u003E';
      case '&':
        return '\\u0026';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return char;
    }
  });
}

function renderTemplate(template: string, llz: LatLonZoom, name: string, title: string, path: string) {
  const nameHtml = name == kSharedViaOM ? name : encodeHTML(name);
  const appUri = `om:/${path}`;
  template = replaceInTemplate(template, {
    ...llz,
    title: encodeHTML(title),
    name: nameHtml,
    nameJs: encodeJavaScriptString(nameHtml),
    path: encodeHTML(path),
    appUriAttr: encodeHTML(appUri),
    appUriJs: encodeJavaScriptString(appUri),
  });
  return new Response(template, { headers: { 'content-type': 'text/html' } });
}

// Clear coordinates: /lat,lon[/name], with an optional ?z= query param. Each number
// may be an integer or have a fractional part: other apps may share rounded coordinates.
// The comma distinguishes this format from ge0's Base64 alphabet. Match the complete
// path so malformed coordinates and coordinate-like pin names cannot become a location.
export const CLEAR_COORDINATES_REGEX = /^\/(?<lat>-?\d+(?:\.\d+)?),(?<lon>-?\d+(?:\.\d+)?)(?:\/(?<name>.*))?$/;

// Throws on decode error.
export async function onGe0Decode(template: string, url: string): Promise<Response> {
  const { pathname, search, hash } = new URL(url);
  const path = pathname + search + hash; // Starts with a slash.

  const m = pathname.match(CLEAR_COORDINATES_REGEX);
  if (m && m.groups) {
    // Zoom comes from the ?z= query param (or the default when absent).
    const zoom = normalizeZoom(new URLSearchParams(search).get('z'));
    const llz = { lat: Number(m.groups.lat), lon: Number(m.groups.lon), zoom };
    if (llz.lat < -90.0 || llz.lat > 90.0 || llz.lon < -180.0 || llz.lon > 180.0)
      throw new Error(`Invalid coordinates ${m.groups.lat} and ${m.groups.lon}`);

    const [name, title] = normalizeNameAndTitle(m.groups.name);
    return renderTemplate(template, llz, name, title, path);
  }

  // Filter empty pathname elements.
  const params = pathname.split('/').filter(Boolean);
  const encodedLatLonZoom = params[0] ?? '';
  const llz = decodeLatLonZoom(encodedLatLonZoom);
  const [name, title] = normalizeNameAndTitle(params.length > 1 ? params[1] : undefined);
  return renderTemplate(template, llz, name, title, path);
}

// Throws exceptions on errors.
export function decodeLatLonZoom(encodedLatLonZoom: string): LatLonZoom {
  const GE0_MAX_POINT_BYTES = 10;
  const GE0_MAX_COORD_BITS = GE0_MAX_POINT_BYTES * 3;

  // Reject malformed clear-coordinate paths before Base64 bit operations can turn
  // unknown characters into zero bits or oversized payloads can wrap the shifts.
  if (
    encodedLatLonZoom.length < 2 ||
    encodedLatLonZoom.length > GE0_MAX_POINT_BYTES + 1 ||
    !/^[A-Za-z0-9_-]+$/.test(encodedLatLonZoom)
  )
    throw new Error(`Invalid coordinates ${encodedLatLonZoom}, the url was not encoded properly`);

  let zoom = base64Reverse[encodedLatLonZoom.charCodeAt(0)];
  if (zoom > 63) throw new Error('Invalid zoom level: the url was not encoded properly');
  zoom = Math.round(zoom / 4 + 4);

  const latLonStr = encodedLatLonZoom.substr(1);
  const latLonBytes = latLonStr.length;

  let lat = 0;
  let lon = 0;

  for (let i = 0, shift = GE0_MAX_COORD_BITS - 3; i < latLonBytes; i++, shift -= 3) {
    const a = base64Reverse[latLonStr.charCodeAt(i)];
    const lat1 = (((a >> 5) & 1) << 2) | (((a >> 3) & 1) << 1) | ((a >> 1) & 1);
    const lon1 = (((a >> 4) & 1) << 2) | (((a >> 2) & 1) << 1) | (a & 1);
    lat |= lat1 << shift;
    lon |= lon1 << shift;
  }

  const remainingBits = 3 * (GE0_MAX_POINT_BYTES - latLonBytes) - 1;
  if (remainingBits >= 0) {
    const middleOfSquare = 1 << remainingBits;
    lat += middleOfSquare;
    lon += middleOfSquare;
  }

  lat = (lat / ((1 << GE0_MAX_COORD_BITS) - 1)) * 180.0 - 90.0;
  lon = (lon / (1 << GE0_MAX_COORD_BITS)) * 360.0 - 180.0;

  lat = Math.round(lat * 1e5) / 1e5;
  lon = Math.round(lon * 1e5) / 1e5;

  if (lat <= -90.0 || lat >= 90.0 || lon <= -180.0 || lon >= 180.0)
    throw new Error(`Invalid coordinates ${encodedLatLonZoom}, the url was not encoded properly`);

  return { lat, lon, zoom };
}

const base64Reverse: Record<number, number> = {
  65: 0,
  66: 1,
  67: 2,
  68: 3,
  69: 4,
  70: 5,
  71: 6,
  72: 7,
  73: 8,
  74: 9,
  75: 10,
  76: 11,
  77: 12,
  78: 13,
  79: 14,
  80: 15,
  81: 16,
  82: 17,
  83: 18,
  84: 19,
  85: 20,
  86: 21,
  87: 22,
  88: 23,
  89: 24,
  90: 25,
  97: 26,
  98: 27,
  99: 28,
  100: 29,
  101: 30,
  102: 31,
  103: 32,
  104: 33,
  105: 34,
  106: 35,
  107: 36,
  108: 37,
  109: 38,
  110: 39,
  111: 40,
  112: 41,
  113: 42,
  114: 43,
  115: 44,
  116: 45,
  117: 46,
  118: 47,
  119: 48,
  120: 49,
  121: 50,
  122: 51,
  48: 52,
  49: 53,
  50: 54,
  51: 55,
  52: 56,
  53: 57,
  54: 58,
  55: 59,
  56: 60,
  57: 61,
  45: 62,
  95: 63,
};
