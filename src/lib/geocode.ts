/**
 * Geocode Swedish addresses using Mapbox v6 (primary) with Nominatim fallback.
 *
 * Mapbox v6 provides rooftop-level accuracy for most Swedish addresses.
 * When proximity (event center) is provided, results are biased to that area,
 * solving the "Storgatan 5" ambiguity problem.
 */

interface Coordinates {
  lat: number;
  lng: number;
}

interface GeocodeOptions {
  /** Bias results toward this point (e.g. event center) */
  proximity?: Coordinates;
  /** Require results within this municipality/city name */
  city?: string;
}

interface GeocodeResult {
  coordinates: Coordinates;
  /** How the coordinates were obtained */
  source: 'mapbox' | 'nominatim';
  /** Mapbox accuracy level: rooftop, parcel, point, interpolated, street, etc. */
  accuracy?: string;
  /** Matched address string from the geocoder */
  matchedAddress?: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/**
 * Primary geocoder: Mapbox Search v6
 * - rooftop accuracy on most addresses
 * - proximity bias for event area
 * - 100k free requests/month
 */
async function geocodeMapbox(
  address: string,
  options: GeocodeOptions = {}
): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) return null;

  const params = new URLSearchParams({
    q: address,
    country: 'se',
    language: 'sv',
    limit: '1',
    access_token: MAPBOX_TOKEN,
  });

  if (options.proximity) {
    params.set('proximity', `${options.proximity.lng},${options.proximity.lat}`);
  }

  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    const props = feature.properties;
    const coords = props?.coordinates;
    if (!coords?.latitude || !coords?.longitude) return null;

    // If city filter is set, verify the result is in the right city
    if (options.city) {
      const ctx = props.context;
      const place = ctx?.place?.name || ctx?.locality?.name || '';
      const district = ctx?.district?.name || '';
      const region = ctx?.region?.name || '';
      const fullAddress = props.full_address || '';
      const searchArea = `${place} ${district} ${region} ${fullAddress}`.toLowerCase();
      const targetCity = options.city.toLowerCase();

      if (!searchArea.includes(targetCity)) {
        // Result is in wrong city — skip
        return null;
      }
    }

    return {
      coordinates: { lat: coords.latitude, lng: coords.longitude },
      source: 'mapbox',
      accuracy: coords.accuracy || 'unknown',
      matchedAddress: props.full_address || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fallback geocoder: Nominatim (OpenStreetMap)
 * - Free, no API key
 * - 1 req/sec rate limit (respect it!)
 * - Good coverage but sometimes street-level only
 */
async function geocodeNominatim(
  address: string,
  options: GeocodeOptions = {}
): Promise<GeocodeResult | null> {
  try {
    const q = options.city && !address.toLowerCase().includes(options.city.toLowerCase())
      ? `${address}, ${options.city}`
      : address;

    const encoded = encodeURIComponent(q.trim());
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

    // If city filter: verify result is in the right area
    if (options.city) {
      const displayName = (data[0].display_name || '').toLowerCase();
      if (!displayName.includes(options.city.toLowerCase())) {
        return null;
      }
    }

    return {
      coordinates: { lat, lng },
      source: 'nominatim',
      accuracy: data[0].type || 'unknown',
      matchedAddress: data[0].display_name || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Geocode a Swedish address with cascading providers.
 *
 * Strategy:
 * 1. Mapbox v6 (fast, rooftop accuracy)
 * 2. Nominatim fallback (broader coverage)
 * 3. null (let user place pin on map)
 */
export async function geocodeAddress(
  address: string,
  options: GeocodeOptions = {}
): Promise<Coordinates | null> {
  if (!address || address.trim().length < 3) return null;

  const result = await geocodeAddressDetailed(address, options);
  return result?.coordinates ?? null;
}

/**
 * Detailed geocode with source and accuracy info.
 * Useful for organizer tools that want to show confidence.
 */
export async function geocodeAddressDetailed(
  address: string,
  options: GeocodeOptions = {}
): Promise<GeocodeResult | null> {
  if (!address || address.trim().length < 3) return null;

  // Try Mapbox first
  const mapboxResult = await geocodeMapbox(address, options);
  if (mapboxResult) return mapboxResult;

  // Fallback to Nominatim
  const nominatimResult = await geocodeNominatim(address, options);
  if (nominatimResult) return nominatimResult;

  return null;
}
