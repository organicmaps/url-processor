declare type LatLonZoom = {
  lat: number;
  lon: number;
  zoom: number;
};

function replaceInTemplate(template: string, data: Record<string, any>) {
  const pattern = /\${\s*(\w+?)\s*}/g;
  return template.replace(pattern, (_, token) => data[token] || '');
}

function fromWindows1251(percentEncoded: string) {
  const decoder = new TextDecoder('windows-1251', { fatal: true, ignoreBOM: false });
  // https://stackoverflow.com/a/69769015
  return percentEncoded.replace(
    /(?:%[0-9A-F]{2})+/g,
    // @ts-expect-error JS allows typed arrays from string arrays, but TS doesn't know that.
    (s) => decoder.decode(Uint8Array.from(s.replaceAll('%', ',0x').slice(1).split(','))),
  );
}

function normalizeNameAndTitle(name: string | undefined): [string, string] {
  let title = 'Organic Maps';
  if (name) {
    name = name.replace(/\+|_/g, ' '); // Convert underscores back to spaces.
    try {
      name = decodeURIComponent(name);
    } catch (ex: any) {
      try {
        // There are some cases when coordinates are correct, but the name is not encoded properly, for example:
        // %DF%F0%EA%EE%E2%F1%EA%EE%E5_%F3%F7%E0%F1%F2%EA%EE%E2%EE%E5_%EB%E5%F1%ED%E8%F7%E5%F1%F2%E2%EE
        // %C8%EB%EE%E2%E0%E9%F1%EA%EE%E5_%F3%F7%E0%F1%F2%EA%EE%E2%EE%E5_%EB%E5%F1%ED%E8%F7%E5%F1%F2%E2%EE
        // Looks like vk.com incorrectly uses Windows-1251 to encode some shared links when querying previews.
        name = fromWindows1251(name);
      } catch (ex: any) {
        name = '😃';
      }
    }

    name = name.replace("'", '&rsquo;'); // To embed in popup.
    title = name + ' | ' + title;
  } else {
    name = 'Shared via <a href="https://organicmaps.app">Organic Maps</a>';
  }
  return [name, title];
}

function normalizeZoom(zoom: string): number {
  const DEFAULT_ZOOM = 14;
  const z = parseInt(zoom);
  if (isNaN(z)) return DEFAULT_ZOOM;
  if (z < 1 || z > 19) return DEFAULT_ZOOM;
  return z;
}

// Coordinates and zoom are validated separately.
const CLEAR_COORDINATES_REGEX =
  /(?<lat>-?\d+\.\d+)[^\d.](?<lon>-?\d+\.\d+)(?:[^\d.](?<zoom>\d{1,2}))?(?:[^\d.](?<name>.+))?/;

// Throws on decode error.
export async function onGe0Decode(template: string, url: string): Promise<Response> {
  const { pathname, search, hash } = new URL(url);

  const m = pathname.match(CLEAR_COORDINATES_REGEX);
  if (m && m.groups) {
    const llz = { lat: Number(m.groups.lat), lon: Number(m.groups.lon), zoom: normalizeZoom(m.groups.zoom) };
    if (llz.lat <= -90.0 || llz.lat >= 90.0 || llz.lon <= -180.0 || llz.lon >= 180.0)
      throw new Error(`Invalid coordinates ${m.groups.lat} and ${m.groups.lon}`);

    const [name, title] = normalizeNameAndTitle(m.groups.name);
    template = replaceInTemplate(template, {
      ...llz,
      title,
      name,
      path: pathname + search + hash, // Starts with a slash
    });
    return new Response(template, { headers: { 'content-type': 'text/html' } });
  }

  // Filter empty pathname elements.
  const params = pathname.split('/').filter(Boolean);
  const encodedLatLonZoom = params[0];
  const llz = decodeLatLonZoom(encodedLatLonZoom);
  const [name, title] = normalizeNameAndTitle(params.length > 1 ? params[1] : undefined);

  template = replaceInTemplate(template, {
    ...llz,
    title,
    name,
    path: pathname + search + hash, // Starts with a slash
  });
  return new Response(template, { headers: { 'content-type': 'text/html' } });
}

// Throws exceptions on errors.
function decodeLatLonZoom(encodedLatLonZoom: string): LatLonZoom {
  const GE0_MAX_POINT_BYTES = 10;
  const GE0_MAX_COORD_BITS = GE0_MAX_POINT_BYTES * 3;

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

  const middleOfSquare = 1 << (3 * (GE0_MAX_POINT_BYTES - latLonBytes) - 1);
  lat += middleOfSquare;
  lon += middleOfSquare;

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
