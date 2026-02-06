/**
 * Geo utilities for distance calculations
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate the centroid (average center) of multiple coordinates
 */
export function calculateCentroid(coords: Coordinates[]): Coordinates {
  if (coords.length === 0) return { lat: 0, lng: 0 };
  
  const sum = coords.reduce(
    (acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }),
    { lat: 0, lng: 0 }
  );
  
  return {
    lat: sum.lat / coords.length,
    lng: sum.lng / coords.length,
  };
}

/**
 * Find outliers - addresses that are too far from the centroid
 * Returns array of { address, distance } for addresses > maxDistanceKm from center
 */
export function findDistanceOutliers(
  addresses: { id: string; address: string; coordinates: Coordinates | null }[],
  maxDistanceKm: number = 5
): { id: string; address: string; distanceKm: number }[] {
  // Filter addresses with coordinates
  const withCoords = addresses.filter(a => a.coordinates);
  
  if (withCoords.length < 2) return [];
  
  // Calculate centroid
  const centroid = calculateCentroid(withCoords.map(a => a.coordinates!));
  
  // Find outliers
  return withCoords
    .map(a => ({
      id: a.id,
      address: a.address,
      distanceKm: calculateDistance(centroid, a.coordinates!),
    }))
    .filter(a => a.distanceKm > maxDistanceKm)
    .sort((a, b) => b.distanceKm - a.distanceKm);
}

/**
 * Geocode an address using Nominatim (OpenStreetMap)
 * Free API, max 1 request/second
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      {
        headers: {
          'User-Agent': 'Cykelfesten/1.0 (dinner-safari-app)',
        },
      }
    );
    
    if (!response.ok) return null;
    
    const results = await response.json();
    if (results.length === 0) return null;
    
    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Batch geocode addresses with rate limiting (1/sec)
 */
export async function batchGeocode(
  addresses: { id: string; address: string }[]
): Promise<Map<string, Coordinates | null>> {
  const results = new Map<string, Coordinates | null>();
  
  for (const { id, address } of addresses) {
    const coords = await geocodeAddress(address);
    results.set(id, coords);
    // Rate limit: wait 1.1 seconds between requests
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  
  return results;
}
