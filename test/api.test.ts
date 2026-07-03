import {
  CLEAR_COORDINATES_REGEX,
  decodeLatLonZoom,
  normalizeZoom,
  normalizeNameAndTitle,
  onGe0Decode,
} from '../src/ge0';

describe('decodeLatLonZoom — ge0 binary short links', () => {
  test.each([
    ['B4srhdHVVt', { lat: 64.5234, lon: 12.1234, zoom: 4 }],
    ['AwAAAAAAAA', { lat: 0, lon: 0, zoom: 4 }],
    ['zzzzzzzzzz', { lat: 38.57143, lon: 77.14286, zoom: 17 }],
    ['AA', { lat: -78.75, lon: -157.5, zoom: 4 }],
  ])('decodes %s', (encoded, expected) => {
    expect(decodeLatLonZoom(encoded as string)).toEqual(expected);
  });

  test('throws when decoded coordinates fall outside the valid range', () => {
    expect(() => decodeLatLonZoom('----------')).toThrow(/Invalid coordinates/);
  });
});

describe('normalizeZoom', () => {
  test('keeps zoom levels within 1..20 (matches the app kMaxZoom)', () => {
    expect(normalizeZoom('1')).toBe(1);
    expect(normalizeZoom('15')).toBe(15);
    expect(normalizeZoom('19')).toBe(19);
    expect(normalizeZoom('20')).toBe(20);
  });

  test('falls back to the default zoom (14) for missing or out-of-range values', () => {
    expect(normalizeZoom('')).toBe(14);
    expect(normalizeZoom('0')).toBe(14);
    expect(normalizeZoom('21')).toBe(14);
    expect(normalizeZoom('99')).toBe(14);
    expect(normalizeZoom('abc')).toBe(14);
    expect(normalizeZoom('16abc')).toBe(14);
    expect(normalizeZoom('1.5')).toBe(14);
  });
});

describe('normalizeNameAndTitle', () => {
  test('uses the "Shared via Organic Maps" placeholder when no name is given', () => {
    const [name, title] = normalizeNameAndTitle(undefined);
    expect(name).toContain('Shared via');
    expect(title).toBe('Organic Maps');
  });

  test('converts + and _ to spaces and appends the app name to the title', () => {
    expect(normalizeNameAndTitle('Some+Name')).toEqual(['Some Name', 'Some Name | Organic Maps']);
  });

  test('falls back to Windows-1251 for names that vk.com mis-encodes', () => {
    // Not valid UTF-8 percent-encoding, so decodeURIComponent throws and the cp1251 path kicks in.
    expect(normalizeNameAndTitle('%DF%F0%EA%EE%E2%F1%EA%EE%E5')[0]).toBe('Ярковское');
  });
});

describe('CLEAR_COORDINATES_REGEX', () => {
  test('captures lat/lon and an optional /name from a clear-text path', () => {
    expect('/53.9,27.56'.match(CLEAR_COORDINATES_REGEX)?.groups).toMatchObject({ lat: '53.9', lon: '27.56' });
    expect('/53.9,27.56/Minsk'.match(CLEAR_COORDINATES_REGEX)?.groups).toMatchObject({
      lat: '53.9',
      lon: '27.56',
      name: 'Minsk',
    });
  });

  test('keeps a digit-initial name intact (there is no in-path zoom to swallow it)', () => {
    expect('/48.85,2.29/7-Eleven'.match(CLEAR_COORDINATES_REGEX)?.groups?.name).toBe('7-Eleven');
    expect('/48.85,2.29/24-hour-shop'.match(CLEAR_COORDINATES_REGEX)?.groups?.name).toBe('24-hour-shop');
  });

  test('does not match an encoded ge0 payload, so it falls through to the binary decoder', () => {
    expect('/B4srhdHVVt'.match(CLEAR_COORDINATES_REGEX)).toBeNull();
  });
});

describe('onGe0Decode — end to end', () => {
  const TEMPLATE =
    '<title>${title}</title><name>${name}</name><coords>${lat},${lon}@${zoom}</coords><path>${path}</path>';
  const FULL_TEMPLATE =
    '<meta name="apple-itunes-app" content="app-id=1567437057, app-argument=${appUriAttr}">' +
    '<script>window.location=${appUriJs};marker.bindPopup(${nameJs});</script>' +
    '<span>${name}</span><path>${path}</path>';

  test('renders an encoded short link into the template', async () => {
    const resp = await onGe0Decode(TEMPLATE, 'https://omaps.app/B4srhdHVVt/Some+Name');
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('text/html');
    const html = await resp.text();
    expect(html).toContain('<coords>64.5234,12.1234@4</coords>');
    expect(html).toContain('<name>Some Name</name>');
    expect(html).toContain('<path>/B4srhdHVVt/Some+Name</path>');
  });

  test('renders a zero coordinate instead of blanking it', async () => {
    // AwAAAAAAAA decodes to 0,0 — must render "0", not an empty string.
    const html = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/AwAAAAAAAA')).text();
    expect(html).toContain('<coords>0,0@4</coords>');
  });

  test('renders clear-text coordinates', async () => {
    const html = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/53.9,27.56/Minsk?z=15')).text();
    expect(html).toContain('<coords>53.9,27.56@15</coords>');
    expect(html).toContain('<name>Minsk</name>');
  });

  test('HTML-escapes the pin name of an encoded link to prevent XSS', async () => {
    const html = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/B4srhdHVVt/a%3Cb%3Ec%26d')).text();
    expect(html).toContain('<name>a&lt;b&gt;c&amp;d</name>');
  });

  test('HTML-escapes the pin name of a clear-text link to prevent XSS', async () => {
    const html = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/12.3,45.6/<script>alert(1)</script>')).text();
    expect(html).toContain('<name>&lt;script&gt;alert(1)&lt;/script&gt;</name>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('escapes the pin name for both HTML and JavaScript template contexts', async () => {
    const html = await (
      await onGe0Decode(FULL_TEMPLATE, 'https://omaps.app/B4srhdHVVt/a%3C%2Fb%3E%26%27%22%5Cn')
    ).text();
    expect(html).toContain('<span>a&lt;/b&gt;&amp;&apos;&quot;\\n</span>');
    expect(html).toContain('marker.bindPopup("a\\u0026lt;/b\\u0026gt;\\u0026amp;\\u0026apos;\\u0026quot;\\\\n");');
  });

  test('escapes the app path before embedding it in meta and JavaScript contexts', async () => {
    const html = await (await onGe0Decode(FULL_TEMPLATE, "https://omaps.app/B4srhdHVVt/';alert(1)//")).text();
    expect(html).toContain('app-argument=om://B4srhdHVVt/&apos;;alert(1)//');
    expect(html).toContain("window.location=\"om://B4srhdHVVt/';alert(1)//\";");
    expect(html).not.toContain("window.location='om://B4srhdHVVt/';alert(1)//';");
    expect(html).toContain('<path>/B4srhdHVVt/&apos;;alert(1)//</path>');
  });

  test('rejects out-of-range clear-text coordinates', async () => {
    await expect(onGe0Decode(TEMPLATE, 'https://omaps.app/91.0,0.0')).rejects.toThrow(/Invalid coordinates/);
  });

  test('reads zoom from the ?z= query param', async () => {
    const html = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/53.9,27.56?z=16')).text();
    expect(html).toContain('<coords>53.9,27.56@16</coords>');
  });

  test('a digit-initial name is not mistaken for a zoom', async () => {
    const html = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/48.85,2.29/7-Eleven?z=16')).text();
    expect(html).toContain('<coords>48.85,2.29@16</coords>');
    expect(html).toContain('<name>7-Eleven</name>');
  });

  test('?z= is optional — a bare link falls back to the default zoom', async () => {
    const bare = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/53.9,27.56')).text();
    expect(bare).toContain('<coords>53.9,27.56@14</coords>');
  });

  test('?z= coexists with a pin name: /lat,lon/Name?z=', async () => {
    const html = await (await onGe0Decode(TEMPLATE, 'https://omaps.app/53.9,27.56/Minsk?z=12')).text();
    expect(html).toContain('<coords>53.9,27.56@12</coords>');
    expect(html).toContain('<name>Minsk</name>');
  });

  test('out-of-range ?z= falls back to the default zoom', async () => {
    for (const z of ['0', '99', 'abc', '16abc', '1.5']) {
      const html = await (await onGe0Decode(TEMPLATE, `https://omaps.app/53.9,27.56?z=${z}`)).text();
      expect(html).toContain('<coords>53.9,27.56@14</coords>');
    }
  });
});
