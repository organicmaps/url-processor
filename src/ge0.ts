declare type LatLonZoom = {
  lat: number;
  lon: number;
  zoom: number;
};

function replaceInTemplate(template: string, data: Record<string, any>) {
  const pattern = /\${\s*(\w+?)\s*}/g;
  return template.replace(pattern, (_, token) => data[token] || '');
}

// Throws on decode error.
export async function onGe0Decode(template: string, encodedLatLonZoom: string, name?: string): Promise<Response> {
  const llz = decodeLatLonZoom(encodedLatLonZoom);
  let title = 'Organic Maps';
  if (name) {
    name = decodeURIComponent(name.replace(/\+|_/g, ' '));
    name = name.replace("'", '&rsquo;');  // To embed in popup.
    title = name + ' | ' + title;
  } else {
    name = 'Shared via <a href="https://organicmaps.app">Organic Maps app</a>';
  }

  template = replaceInTemplate(template, { ...llz, title, name });
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
    throw new Error('Invalid coordinates: the url was not encoded properly');

  return { lat, lon, zoom };
}

const base64Reverse: { [key: number]: number } = {
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
