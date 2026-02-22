'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface RegisteredCouple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  coordinates: string | null;
  confirmed: boolean;
  cancelled: boolean;
  approval_status?: string;
  address: string | null;
}

interface Props {
  eventId: string;
}

const STATUS_COLORS: Record<string, string> = {
  approved: '#22c55e',   // green
  waiting: '#eab308',    // yellow
  incomplete: '#ef4444', // red
  cancelled: '#9ca3af',  // gray
};

function getStatus(c: RegisteredCouple): string {
  if (c.cancelled) return 'cancelled';
  if (!c.coordinates) return 'incomplete';
  if (c.confirmed && c.approval_status === 'approved') return 'approved';
  return 'waiting';
}

function parseCoords(coordStr: string): [number, number] | null {
  // PostgreSQL point format: (lng,lat)
  const m = coordStr.match(/\(?([-\d.]+),([-\d.]+)\)?/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2])];
}

export function RegistrationMap({ eventId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [couples, setCouples] = useState<RegisteredCouple[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch couples
  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/guests`)
      .then(r => r.json())
      .then(data => { setCouples(data.couples || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [eventId]);

  // Init map
  useEffect(() => {
    if (loading || !containerRef.current || mapRef.current) return;

    const withCoords = couples
      .filter(c => !c.cancelled && c.coordinates)
      .map(c => ({ ...c, coords: parseCoords(c.coordinates!) }))
      .filter(c => c.coords !== null) as (RegisteredCouple & { coords: [number, number] })[];

    if (withCoords.length === 0) return;

    // Calculate bounds
    const lngs = withCoords.map(c => c.coords[0]);
    const lats = withCoords.map(c => c.coords[1]);
    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)]
    );

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      bounds,
      fitBoundsOptions: { padding: 50 },
    });
    mapRef.current = map;

    map.on('load', () => {
      // Convex hull polygon (event area)
      const hullPoints = convexHull(withCoords.map(c => c.coords));
      if (hullPoints.length >= 3) {
        map.addSource('event-area', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [[...hullPoints, hullPoints[0]]],
            },
          },
        });
        map.addLayer({
          id: 'event-area-fill',
          type: 'fill',
          source: 'event-area',
          paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.06 },
        });
        map.addLayer({
          id: 'event-area-border',
          type: 'line',
          source: 'event-area',
          paint: { 'line-color': '#6366f1', 'line-opacity': 0.2, 'line-width': 1.5 },
        });
      }

      // Points per status
      const features = withCoords.map(c => ({
        type: 'Feature' as const,
        properties: {
          id: c.id,
          name: c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : ''),
          status: getStatus(c),
          color: STATUS_COLORS[getStatus(c)],
          address: c.address || '',
        },
        geometry: { type: 'Point' as const, coordinates: c.coords },
      }));

      map.addSource('registrations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      map.addLayer({
        id: 'registration-dots',
        type: 'circle',
        source: 'registrations',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        },
      });

      // Popup on click
      map.on('click', 'registration-dots', (e) => {
        const feature = e.features?.[0];
        if (!feature || !feature.properties) return;
        const { name, status, address } = feature.properties;
        const statusLabel: Record<string, string> = {
          approved: '✅ Godkänd',
          waiting: '⏳ Väntar',
          incomplete: '❌ Inkomplett',
          cancelled: '⚫ Avbokad',
        };
        const coords = (feature.geometry as any).coordinates.slice();
        new mapboxgl.Popup({ offset: 12, closeButton: false })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-family: system-ui; font-size: 13px;">
              <strong>${name}</strong><br/>
              <span style="color: ${STATUS_COLORS[status]}">${statusLabel[status] || status}</span><br/>
              <span style="color: #6b7280; font-size: 11px;">${address}</span>
            </div>
          `)
          .addTo(map);
      });

      // Cursor on hover
      map.on('mouseenter', 'registration-dots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'registration-dots', () => { map.getCanvas().style.cursor = ''; });
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [loading, couples]);

  if (loading) {
    return <div className="h-[400px] rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Laddar karta...</div>;
  }

  const withCoords = couples.filter(c => !c.cancelled && c.coordinates).length;
  const total = couples.filter(c => !c.cancelled).length;

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Godkänd</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Väntar</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Inkomplett</span>
        {withCoords < total && (
          <span className="text-amber-600">⚠️ {total - withCoords} saknar position</span>
        )}
      </div>
      {/* Map */}
      <div ref={containerRef} className="h-[400px] rounded-xl overflow-hidden border border-gray-200" />
    </div>
  );
}

/* ── Convex Hull (Graham scan) ─────────────────────── */

function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;

  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  function cross(o: [number, number], a: [number, number], b: [number, number]) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }

  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
