/**
 * Geo utilities for distance calculations
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CyclingDistance {
  distance_km: number;
  duration_min: number;
  source: 'cycling' | 'haversine';
}

/**
 * Calculate distance between two coordinates using Haversine formula (fågelvägen)
 * Returns distance in kilometers
 */
export function calculateHaversineDistance(from: Coordinates, to: Coordinates): number {
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

// Alias for backwards compatibility
export const calculateDistance = calculateHaversineDistance;

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Get cycling distance and duration using OpenRouteService API
 * Falls back to Haversine if API key not configured or request fails
 */
export async function getCyclingDistance(
  from: Coordinates, 
  to: Coordinates,
  apiKey?: string
): Promise<CyclingDistance> {
  const key = apiKey || process.env.OPENROUTESERVICE_API_KEY;
  
  if (!key) {
    // Fallback to Haversine
    const distance = calculateHaversineDistance(from, to);
    return {
      distance_km: Math.round(distance * 10) / 10,
      duration_min: Math.round(distance * 4), // Rough estimate: 15 km/h cycling
      source: 'haversine',
    };
  }
  
  try {
    const response = await fetch(
      'https://api.openrouteservice.org/v2/directions/cycling-regular',
      {
        method: 'POST',
        headers: {
          'Authorization': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        }),
      }
    );
    
    if (!response.ok) {
      console.error('OpenRouteService error:', response.status);
      // Fallback to Haversine
      const distance = calculateHaversineDistance(from, to);
      return {
        distance_km: Math.round(distance * 10) / 10,
        duration_min: Math.round(distance * 4),
        source: 'haversine',
      };
    }
    
    const data = await response.json();
    const route = data.routes?.[0];
    
    if (!route) {
      throw new Error('No route found');
    }
    
    return {
      distance_km: Math.round((route.summary.distance / 1000) * 10) / 10,
      duration_min: Math.round(route.summary.duration / 60),
      source: 'cycling',
    };
  } catch (error) {
    console.error('Cycling distance error:', error);
    // Fallback to Haversine
    const distance = calculateHaversineDistance(from, to);
    return {
      distance_km: Math.round(distance * 10) / 10,
      duration_min: Math.round(distance * 4),
      source: 'haversine',
    };
  }
}

/**
 * Get cycling distance matrix for multiple locations in ONE request
 * Much more efficient than individual requests!
 * Returns a 2D array of distances and durations
 */
export async function getCyclingDistanceMatrix(
  locations: Coordinates[],
  apiKey?: string
): Promise<{
  distances: number[][];  // km
  durations: number[][];  // minutes
  source: 'cycling' | 'haversine';
} | null> {
  const key = apiKey || process.env.OPENROUTESERVICE_API_KEY;
  
  if (!key || locations.length > 50) {
    // Fallback to Haversine matrix
    const distances: number[][] = [];
    const durations: number[][] = [];
    
    for (let i = 0; i < locations.length; i++) {
      distances[i] = [];
      durations[i] = [];
      for (let j = 0; j < locations.length; j++) {
        const dist = calculateHaversineDistance(locations[i], locations[j]);
        distances[i][j] = Math.round(dist * 10) / 10;
        durations[i][j] = Math.round(dist * 4); // ~15 km/h estimate
      }
    }
    
    return { distances, durations, source: 'haversine' };
  }
  
  try {
    const response = await fetch(
      'https://api.openrouteservice.org/v2/matrix/cycling-regular',
      {
        method: 'POST',
        headers: {
          'Authorization': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locations: locations.map(l => [l.lng, l.lat]),
          metrics: ['distance', 'duration'],
          units: 'km',
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouteService matrix error:', response.status, error);
      // Fallback to Haversine
      return getCyclingDistanceMatrix(locations, undefined);
    }
    
    const data = await response.json();
    
    // Convert durations from seconds to minutes
    const durations = data.durations.map((row: number[]) => 
      row.map((d: number) => Math.round(d / 60))
    );
    
    // Round distances
    const distances = data.distances.map((row: number[]) =>
      row.map((d: number) => Math.round(d * 10) / 10)
    );
    
    return { distances, durations, source: 'cycling' };
  } catch (error) {
    console.error('Cycling matrix error:', error);
    // Fallback to Haversine
    const distances: number[][] = [];
    const durations: number[][] = [];
    
    for (let i = 0; i < locations.length; i++) {
      distances[i] = [];
      durations[i] = [];
      for (let j = 0; j < locations.length; j++) {
        const dist = calculateHaversineDistance(locations[i], locations[j]);
        distances[i][j] = Math.round(dist * 10) / 10;
        durations[i][j] = Math.round(dist * 4);
      }
    }
    
    return { distances, durations, source: 'haversine' };
  }
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
