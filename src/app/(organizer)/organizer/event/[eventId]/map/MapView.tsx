'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import type { FeatureCollection, Feature, LineString, Point } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';

/* ── Types ─────────────────────────────────────────── */

interface MapCouple {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isHost: boolean;
  isConfirmed: boolean;
}

interface MissingCoords {
  id: string;
  name: string;
  address: string;
}

interface RouteSegment {
  from: [number, number];
  to: [number, number];
  geometry: [number, number][] | null;
  guestName: string;
  hostName: string;
  guestId: string;
  hostId: string;
}

interface MapData {
  couples: MapCouple[];
  missingCoords: MissingCoords[];
  routes: {
    starter: RouteSegment[];
    main: RouteSegment[];
    dessert: RouteSegment[];
  } | null;
}

type Course = 'starter' | 'main' | 'dessert';

interface Props {
  eventId: string;
  eventName: string;
}

/* ── Constants ─────────────────────────────────────── */

const DEFAULT_CENTER: [number, number] = [18.06, 59.33];
const COURSES: Course[] = ['starter', 'main', 'dessert'];
const COURSE_CONFIG = {
  starter: { label: 'Förrätt', emoji: '🥗', color: '#f59e0b' },
  main: { label: 'Varmrätt', emoji: '🍖', color: '#ef4444' },
  dessert: { label: 'Efterrätt', emoji: '🍰', color: '#8b5cf6' },
} as const;

/* ── Component ─────────────────────────────────────── */

export function MapView({ eventId, eventName }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [data, setData] = useState<MapData>({ couples: [], missingCoords: [], routes: null });
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [selectedCoupleId, setSelectedCoupleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const routePopupRef = useRef<mapboxgl.Popup | null>(null);

  /* ── Memos ──────────────────────────────────────── */

  const featureCollection = useMemo((): FeatureCollection<Point> => ({
    type: 'FeatureCollection',
    features: data.couples.map((c) => ({
      type: 'Feature',
      properties: { id: c.id, name: c.name, address: c.address, isHost: c.isHost, isConfirmed: c.isConfirmed },
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    })),
  }), [data.couples]);

  // Build line features — use real cycling geometry if available, fallback to straight line
  const routeFeatures = useMemo(() => {
    const result: Record<Course, FeatureCollection<LineString>> = {
      starter: { type: 'FeatureCollection', features: [] },
      main: { type: 'FeatureCollection', features: [] },
      dessert: { type: 'FeatureCollection', features: [] },
    };
    if (!data.routes) return result;

    COURSES.forEach((course) => {
      result[course] = {
        type: 'FeatureCollection',
        features: (data.routes![course] || []).map((seg): Feature<LineString> => ({
          type: 'Feature',
          properties: {
            guestName: seg.guestName,
            hostName: seg.hostName,
            guestId: seg.guestId,
            hostId: seg.hostId,
          },
          geometry: {
            type: 'LineString',
            coordinates: seg.geometry ?? [seg.from, seg.to],
          },
        })),
      };
    });
    return result;
  }, [data.routes]);

  const hostHighlights = useMemo(() => {
    const result: Record<Course, FeatureCollection<Point>> = {
      starter: { type: 'FeatureCollection', features: [] },
      main: { type: 'FeatureCollection', features: [] },
      dessert: { type: 'FeatureCollection', features: [] },
    };
    if (!data.routes) return result;

    COURSES.forEach((course) => {
      const seen = new Set<string>();
      result[course] = {
        type: 'FeatureCollection',
        features: (data.routes![course] || []).reduce<Feature<Point>[]>((acc, seg) => {
          if (seen.has(seg.hostId)) return acc;
          seen.add(seg.hostId);
          acc.push({
            type: 'Feature',
            properties: { hostId: seg.hostId },
            geometry: { type: 'Point', coordinates: seg.to },
          });
          return acc;
        }, []),
      };
    });
    return result;
  }, [data.routes]);

  // IDs of couples related to selected couple (for highlight)
  // Host clicked → that host's guests. Guest clicked → find host → show all host's guests.
  const highlightFilter = useMemo(() => {
    if (!selectedCoupleId || !data.routes || !activeCourse) return null;
    const relatedIds = new Set<string>();
    relatedIds.add(selectedCoupleId);

    const segs = data.routes[activeCourse] || [];
    const relevantHostIds = new Set<string>();

    segs.forEach((seg) => {
      if (seg.hostId === selectedCoupleId) {
        relevantHostIds.add(seg.hostId);
      } else if (seg.guestId === selectedCoupleId) {
        relevantHostIds.add(seg.hostId);
        relatedIds.add(seg.hostId);
      }
    });

    // Add all guests going to those hosts
    segs.forEach((seg) => {
      if (relevantHostIds.has(seg.hostId)) {
        relatedIds.add(seg.guestId);
        relatedIds.add(seg.hostId);
      }
    });

    return relatedIds.size > 1 ? relatedIds : null;
  }, [selectedCoupleId, data.routes, activeCourse]);

  const toggleCourse = useCallback((course: Course) => {
    setActiveCourse((prev) => prev === course ? null : course);
    setSelectedCoupleId(null);
  }, []);

  /* ── Fetch data ─────────────────────────────────── */

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/organizer/events/${eventId}/map-data`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Kunde inte hämta kartdata');
        return res.json();
      })
      .then((json) => { if (alive) { setData(json); setError(null); } })
      .catch((err: Error) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventId]);

  /* ── Init map ───────────────────────────────────── */

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: DEFAULT_CENTER,
      zoom: 5,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Pin source (clustered)
      map.addSource('couples', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'couples',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#94a3b8',
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 30, 26],
          'circle-opacity': 0.8,
        },
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'couples',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#0f172a' },
      });

      const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };

      // Route + host layers per course (added BEFORE pins so pins are on top)
      COURSES.forEach((course) => {
        const color = COURSE_CONFIG[course].color;

        // Route lines
        map.addSource(`route-${course}`, { type: 'geojson', data: empty });
        map.addLayer({
          id: `route-${course}-line`, type: 'line', source: `route-${course}`,
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.5 },
        });
        // Bold version for highlighted routes
        map.addLayer({
          id: `route-${course}-bold`, type: 'line', source: `route-${course}`,
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.9 },
          filter: ['==', 'guestId', ''], // initially matches nothing
        });

        // Host halos
        map.addSource(`host-${course}`, { type: 'geojson', data: empty });
        map.addLayer({
          id: `host-${course}-halo`, type: 'circle', source: `host-${course}`,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 16,
            'circle-color': 'transparent',
            'circle-opacity': 1,
            'circle-stroke-color': color,
            'circle-stroke-width': 3,
            'circle-stroke-opacity': 0.6,
          },
        });

        // Hover tooltip on route lines
        map.on('mouseenter', `route-${course}-line`, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (!f) return;
          const { guestName, hostName } = f.properties as any;
          if (routePopupRef.current) routePopupRef.current.remove();
          routePopupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: false })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="font-size:12px;font-weight:600">${guestName} → ${hostName}</div>`)
            .addTo(map);
        });
        map.on('mouseleave', `route-${course}-line`, () => {
          map.getCanvas().style.cursor = '';
          routePopupRef.current?.remove();
          routePopupRef.current = null;
        });
      });

      // Individual pins (ON TOP of routes)
      map.addLayer({
        id: 'unclustered-point', type: 'circle', source: 'couples',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 8,
          'circle-color': ['case',
            ['==', ['get', 'isConfirmed'], false], '#e5e7eb',
            ['==', ['get', 'isHost'], true], '#16a34a',
            '#2563eb',
          ],
          'circle-stroke-color': ['case',
            ['==', ['get', 'isConfirmed'], false], '#9ca3af',
            '#ffffff',
          ],
          'circle-stroke-width': ['case',
            ['==', ['get', 'isConfirmed'], false], 2, 1,
          ],
        },
      });

      // Click handlers
      map.on('click', 'clusters', (e) => {
        const f = e.features?.[0];
        const clusterId = f?.properties?.cluster_id;
        if (clusterId == null) return;
        (map.getSource('couples') as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          map.easeTo({ center: (f!.geometry as any).coordinates, zoom });
        });
      });

      map.on('click', 'unclustered-point', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const coords = (f.geometry as any).coordinates.slice();
        const { id, name, address } = f.properties as any;

        // Toggle highlight
        setSelectedCoupleId((prev) => prev === id ? null : id);

        new mapboxgl.Popup({ offset: 12 })
          .setLngLat(coords)
          .setHTML(`<div style="font-weight:600;margin-bottom:4px">${name}</div><div style="font-size:12px;color:#475569">${address}</div>`)
          .addTo(map);
      });

      // Click on map background → clear highlight
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ['unclustered-point', 'clusters', ...COURSES.map(c => `route-${c}-line`)],
        });
        if (features.length === 0) setSelectedCoupleId(null);
      });

      // Cursors
      ['clusters', 'unclustered-point'].forEach((layer) => {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      });

      setMapLoaded(true);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ── Sync data → map ────────────────────────────── */

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    (map.getSource('couples') as mapboxgl.GeoJSONSource | undefined)?.setData(featureCollection as any);

    COURSES.forEach((course) => {
      (map.getSource(`route-${course}`) as mapboxgl.GeoJSONSource | undefined)?.setData(routeFeatures[course] as any);
      (map.getSource(`host-${course}`) as mapboxgl.GeoJSONSource | undefined)?.setData(hostHighlights[course] as any);
    });

    if (featureCollection.features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      featureCollection.features.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
      map.fitBounds(bounds, { padding: 80, duration: 800 });
    }
  }, [featureCollection, routeFeatures, hostHighlights, mapLoaded]);

  /* ── Toggle course visibility ───────────────────── */

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    COURSES.forEach((course) => {
      const vis = activeCourse === course ? 'visible' : 'none';
      ['line', 'bold'].forEach((suffix) => {
        map.getLayer(`route-${course}-${suffix}`) &&
          map.setLayoutProperty(`route-${course}-${suffix}`, 'visibility', vis);
      });
      map.getLayer(`host-${course}-halo`) &&
        map.setLayoutProperty(`host-${course}-halo`, 'visibility', vis);
    });
  }, [activeCourse, mapLoaded]);

  /* ── Highlight selected couple's routes ─────────── */

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    if (highlightFilter && selectedCoupleId && activeCourse) {
      const relatedArr = Array.from(highlightFilter);

      // Bold lines for related routes, hide the rest
      map.setFilter(`route-${activeCourse}-bold`, [
        'any',
        ['in', ['get', 'hostId'], ['literal', relatedArr]],
      ]);
      map.setFilter(`route-${activeCourse}-line`, [
        'any',
        ['in', ['get', 'hostId'], ['literal', relatedArr]],
      ]);
      map.setPaintProperty(`route-${activeCourse}-line`, 'line-opacity', 0);

      // Dim unrelated pins
      map.setPaintProperty('unclustered-point', 'circle-opacity', [
        'case',
        ['in', ['get', 'id'], ['literal', relatedArr]], 1,
        0.35,
      ]);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', [
        'case',
        ['in', ['get', 'id'], ['literal', relatedArr]], 1,
        0.35,
      ]);
    } else {
      COURSES.forEach((course) => {
        map.setFilter(`route-${course}-bold`, ['==', 'guestId', '']);
        map.setFilter(`route-${course}-line`, null);
        map.setPaintProperty(`route-${course}-line`, 'line-opacity', 0.5);
      });

      map.setPaintProperty('unclustered-point', 'circle-opacity', 1);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', 1);
    }
  }, [highlightFilter, selectedCoupleId, activeCourse, mapLoaded]);

  /* ── Render ─────────────────────────────────────── */

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href={`/organizer/event/${eventId}`} className="text-gray-500 hover:text-gray-700">
            ← Tillbaka
          </Link>
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-900">{eventName}</div>
            {data.couples.length > 0 && (
              <div className="text-xs text-gray-500">
                {data.couples.length} par på kartan
                {data.missingCoords.length > 0 && ` · ${data.missingCoords.length} saknar adress`}
              </div>
            )}
          </div>
          <div />
        </div>
      </header>

      {data.routes && (
        <div className="bg-white border-b">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap gap-2">
            {COURSES.map((course) => {
              const active = activeCourse === course;
              const cfg = COURSE_CONFIG[course];
              return (
                <button
                  key={course}
                  type="button"
                  onClick={() => toggleCourse(course)}
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border transition ${
                    active ? 'text-white border-transparent' : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  style={active ? { backgroundColor: cfg.color } : undefined}
                >
                  <span>{cfg.emoji}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
            {selectedCoupleId && (
              <button
                type="button"
                onClick={() => setSelectedCoupleId(null)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition"
              >
                ✕ Rensa markering
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        <div className="absolute bottom-8 left-4 bg-white/95 backdrop-blur rounded-xl shadow-sm border border-gray-200 px-3 py-2 text-sm space-y-1">
          <div className="flex items-center gap-2"><span>🟢</span><span>Värd</span></div>
          <div className="flex items-center gap-2"><span>🔵</span><span>Gäst</span></div>
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white/90 rounded-xl px-4 py-2 text-sm text-gray-600 shadow">Laddar karta…</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white rounded-xl px-4 py-2 text-sm text-red-600 shadow">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
