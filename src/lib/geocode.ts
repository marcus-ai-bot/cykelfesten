/**
 * Geocode an address using Nominatim (OpenStreetMap)
 * Free, no API key required, 1 req/sec limit
 */

interface Coordinates {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim().length < 3) return null;

  try {
    const encoded = encodeURIComponent(address.trim());
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&countrycodes=se`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Cykelfesten/1.0 (marcus-ai@isaksson.cc)',
        'Accept-Language': 'sv',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.length === 0) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    if (isNaN(lat) || isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    // Geocoding failure is non-critical
    return null;
  }
}
