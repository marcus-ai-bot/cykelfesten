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

interface MealGroup {
  hostId: string;
  hostName: string;
  hostAddress: string;
  hostCoords: [number, number];
  guests: Array<{
    id: string;
    name: string;
    address: string;
    coords: [number, number];
  }>;
  totalPeople: number;
}

interface Props {
  eventId: string;
  eventName: string;
}

/* ── Constants ─────────────────────────────────────── */

const DEFAULT_CENTER: [number, number] = [18.06, 59.33];
const COURSES: Course[] = ['starter', 'main', 'dessert'];
const COURSE_CONFIG = {
  starter: { label: 'Förrätt', emoji: '🥗', color: '#f59e0b', time: '17:30' },
  main: { label: 'Varmrätt', emoji: '🍖', color: '#ef4444', time: '19:00' },
  dessert: { label: 'Efterrätt', emoji: '🍰', color: '#8b5cf6', time: '20:30' },
} as const;

/* ── Haversine distance (km) ──────────────────────── */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ── Component ─────────────────────────────────────── */

export function MapView({ eventId, eventName }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [data, setData] = useState<MapData>({ couples: [], missingCoords: [], routes: null });
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<MealGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);

  /* ── Build meal groups per course ───────────────── */

  const mealGroups = useMemo(() => {
    const result: Record<Course, Map<string, MealGroup>> = {
      starter: new Map(),
      main: new Map(),
      dessert: new Map(),
    };
    if (!data.routes) return result;

    const byId = new Map(data.couples.map((c) => [c.id, c]));

    COURSES.forEach((course) => {
      const groups = new Map<string, MealGroup>();
      (data.routes![course] || []).forEach((seg) => {
        const host = byId.get(seg.hostId);
        const guest = byId.get(seg.guestId);
        if (!host) return;

        if (!groups.has(seg.hostId)) {
          groups.set(seg.hostId, {
            hostId: seg.hostId,
            hostName: host.name,
            hostAddress: host.address,
            hostCoords: [host.lng, host.lat],
            guests: [],
            totalPeople: 2, // host couple
          });
        }
        const g = groups.get(seg.hostId)!;
        if (guest && !g.guests.find((x) => x.id === seg.guestId)) {
          g.guests.push({
            id: seg.guestId,
            name: guest.name,
            address: guest.address,
            coords: [guest.lng, guest.lat],
          });
          g.totalPeople += guest.name.includes('&') ? 2 : 1;
        }
      });
      result[course] = groups;
    });
    return result;
  }, [data]);

  /* ── Find meal group for a couple+course ────────── */

  const findGroupForCouple = useCallback((coupleId: string, course: Course): MealGroup | null => {
    const groups = mealGroups[course];
    // Is this couple a host?
    if (groups.has(coupleId)) return groups.get(coupleId)!;
    // Is this couple a guest?
    for (const group of groups.values()) {
      if (group.guests.some((g) => g.id === coupleId)) return group;
    }
    return null;
  }, [mealGroups]);

  /* ── IDs in selected group (for map highlight) ──── */

  const selectedGroupIds = useMemo(() => {
    if (!selectedGroup) return null;
    const ids = new Set<string>();
    ids.add(selectedGroup.hostId);
    selectedGroup.guests.forEach((g) => ids.add(g.id));
    return ids;
  }, [selectedGroup]);

  /* ── GeoJSON sources ────────────────────────────── */

  const featureCollection = useMemo((): FeatureCollection<Point> => ({
    type: 'FeatureCollection',
    features: data.couples.map((c) => ({
      type: 'Feature',
      properties: { id: c.id, name: c.name, address: c.address, isHost: c.isHost, isConfirmed: c.isConfirmed },
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    })),
  }), [data.couples]);

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
          properties: { guestName: seg.guestName, hostName: seg.hostName, guestId: seg.guestId, hostId: seg.hostId },
          geometry: { type: 'LineString', coordinates: seg.geometry ?? [seg.from, seg.to] },
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
          const host = data.couples.find((c) => c.id === seg.hostId);
          if (host) {
            acc.push({
              type: 'Feature',
              properties: { hostId: seg.hostId, name: host.name },
              geometry: { type: 'Point', coordinates: [host.lng, host.lat] },
            });
          }
          return acc;
        }, []),
      };
    });
    return result;
  }, [data]);

  /* ── Course stats ───────────────────────────────── */

  const courseStats = useMemo(() => {
    const stats: Record<Course, { hosts: number; groups: number }> = {
      starter: { hosts: 0, groups: 0 },
      main: { hosts: 0, groups: 0 },
      dessert: { hosts: 0, groups: 0 },
    };
    COURSES.forEach((course) => {
      const count = mealGroups[course].size;
      stats[course] = { hosts: count, groups: count };
    });
    return stats;
  }, [mealGroups]);

  /* ── Actions ────────────────────────────────────── */

  const toggleCourse = useCallback((course: Course) => {
    setActiveCourse((prev) => {
      const next = prev === course ? null : course;
      if (!next) setSelectedGroup(null);
      return next;
    });
    setSelectedGroup(null);
  }, []);

  const selectCouple = useCallback((coupleId: string) => {
    if (!activeCourse) return;
    const group = findGroupForCouple(coupleId, activeCourse);
    setSelectedGroup((prev) => prev?.hostId === group?.hostId ? null : group);
  }, [activeCourse, findGroupForCouple]);

  const clearSelection = useCallback(() => {
    setSelectedGroup(null);
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

      // Route + host layers per course
      COURSES.forEach((course) => {
        const color = COURSE_CONFIG[course].color;

        map.addSource(`route-${course}`, { type: 'geojson', data: empty });
        // Faint lines (background)
        map.addLayer({
          id: `route-${course}-line`, type: 'line', source: `route-${course}`,
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.3, 'line-dasharray': [2, 2] },
        });
        // Bold lines (highlighted group)
        map.addLayer({
          id: `route-${course}-bold`, type: 'line', source: `route-${course}`,
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.85 },
          filter: ['==', 'guestId', ''],
        });

        // Host markers (larger circles with stroke)
        map.addSource(`host-${course}`, { type: 'geojson', data: empty });
        map.addLayer({
          id: `host-${course}-fill`, type: 'circle', source: `host-${course}`,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': 12,
            'circle-color': color,
            'circle-opacity': 0.9,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
          },
        });
        // Host label (🏠)
        map.addLayer({
          id: `host-${course}-label`, type: 'symbol', source: `host-${course}`,
          layout: {
            visibility: 'none',
            'text-field': '🏠',
            'text-size': 11,
            'text-allow-overlap': true,
          },
        });
      });

      // Individual pins (on top)
      map.addLayer({
        id: 'unclustered-point', type: 'circle', source: 'couples',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 6,
          'circle-color': '#64748b',
          'circle-opacity': 0.7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });

      // Click: clusters
      map.on('click', 'clusters', (e) => {
        const f = e.features?.[0];
        const clusterId = f?.properties?.cluster_id;
        if (clusterId == null) return;
        (map.getSource('couples') as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          map.easeTo({ center: (f!.geometry as any).coordinates, zoom });
        });
      });

      // Click: individual pins
      map.on('click', 'unclustered-point', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const { id } = f.properties as any;
        selectCouple(id);
      });

      // Click: host markers
      COURSES.forEach((course) => {
        map.on('click', `host-${course}-fill`, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const { hostId } = f.properties as any;
          selectCouple(hostId);
        });
        map.on('mouseenter', `host-${course}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `host-${course}-fill`, () => { map.getCanvas().style.cursor = ''; });
      });

      // Click: background
      map.on('click', (e) => {
        const layers = ['unclustered-point', 'clusters', ...COURSES.flatMap(c => [`route-${c}-line`, `host-${c}-fill`])];
        const features = map.queryRenderedFeatures(e.point, { layers });
        if (features.length === 0) clearSelection();
      });

      ['clusters', 'unclustered-point'].forEach((layer) => {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      });

      setMapLoaded(true);
    });

    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selectCouple/clearSelection in sync with map click handlers
  const selectCoupleRef = useRef(selectCouple);
  const clearSelectionRef = useRef(clearSelection);
  selectCoupleRef.current = selectCouple;
  clearSelectionRef.current = clearSelection;

  // Re-bind click handlers when callbacks change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const handlePinClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (f) selectCoupleRef.current(f.properties?.id);
    };

    const handleBgClick = (e: mapboxgl.MapMouseEvent) => {
      const layers = ['unclustered-point', 'clusters', ...COURSES.flatMap(c => [`route-${c}-line`, `host-${c}-fill`])];
      const features = map.queryRenderedFeatures(e.point, { layers });
      if (features.length === 0) clearSelectionRef.current();
    };

    // These override the ones set in init — mapbox stacks handlers
    // We handle it via refs instead
  }, [mapLoaded, selectCouple, clearSelection]);

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
      const active = activeCourse === course;
      const vis = active ? 'visible' : 'none';
      ['line', 'bold'].forEach((suffix) => {
        if (map.getLayer(`route-${course}-${suffix}`))
          map.setLayoutProperty(`route-${course}-${suffix}`, 'visibility', vis);
      });
      if (map.getLayer(`host-${course}-fill`))
        map.setLayoutProperty(`host-${course}-fill`, 'visibility', vis);
      if (map.getLayer(`host-${course}-label`))
        map.setLayoutProperty(`host-${course}-label`, 'visibility', vis);
    });

    // When course is active: dim default pins, let host markers shine
    if (activeCourse) {
      map.setPaintProperty('unclustered-point', 'circle-radius', 5);
      map.setPaintProperty('unclustered-point', 'circle-opacity', 0.3);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', 0.3);
    } else {
      map.setPaintProperty('unclustered-point', 'circle-radius', 6);
      map.setPaintProperty('unclustered-point', 'circle-opacity', 0.7);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', 1);
    }
  }, [activeCourse, mapLoaded]);

  /* ── Highlight selected group ───────────────────── */

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Clear any old popups
    popupsRef.current.forEach((p) => p.remove());
    popupsRef.current = [];

    if (selectedGroup && activeCourse) {
      const ids = Array.from(selectedGroupIds || []);

      // Bold only this group's routes
      map.setFilter(`route-${activeCourse}-bold`, [
        'any',
        ['==', ['get', 'hostId'], selectedGroup.hostId],
      ]);
      // Hide faint lines for other groups
      map.setPaintProperty(`route-${activeCourse}-line`, 'line-opacity', 0.1);

      // Dim all pins except group members
      map.setPaintProperty('unclustered-point', 'circle-opacity', [
        'case', ['in', ['get', 'id'], ['literal', ids]], 0.9, 0.1,
      ]);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', [
        'case', ['in', ['get', 'id'], ['literal', ids]], 1, 0.1,
      ]);
      map.setPaintProperty('unclustered-point', 'circle-radius', [
        'case', ['in', ['get', 'id'], ['literal', ids]], 7, 4,
      ]);

      // Dim host markers except selected
      map.setPaintProperty(`host-${activeCourse}-fill`, 'circle-opacity', [
        'case', ['==', ['get', 'hostId'], selectedGroup.hostId], 1, 0.15,
      ]);

      // Zoom to fit group
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(selectedGroup.hostCoords);
      selectedGroup.guests.forEach((g) => bounds.extend(g.coords));
      map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 420, right: 80 }, duration: 600, maxZoom: 16 });

    } else if (activeCourse) {
      // Course active but no group selected — show all
      map.setFilter(`route-${activeCourse}-bold`, ['==', 'guestId', '']);
      map.setPaintProperty(`route-${activeCourse}-line`, 'line-opacity', 0.3);
      map.setPaintProperty('unclustered-point', 'circle-opacity', 0.3);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', 0.3);
      map.setPaintProperty('unclustered-point', 'circle-radius', 5);
      if (map.getLayer(`host-${activeCourse}-fill`))
        map.setPaintProperty(`host-${activeCourse}-fill`, 'circle-opacity', 0.9);
    } else {
      // Nothing selected — reset everything
      COURSES.forEach((course) => {
        map.setFilter(`route-${course}-bold`, ['==', 'guestId', '']);
        map.setPaintProperty(`route-${course}-line`, 'line-opacity', 0.3);
        if (map.getLayer(`host-${course}-fill`))
          map.setPaintProperty(`host-${course}-fill`, 'circle-opacity', 0.9);
      });
      map.setPaintProperty('unclustered-point', 'circle-opacity', 0.7);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', 1);
      map.setPaintProperty('unclustered-point', 'circle-radius', 6);
    }
  }, [selectedGroup, selectedGroupIds, activeCourse, mapLoaded]);

  /* ── Render ─────────────────────────────────────── */

  const cfg = activeCourse ? COURSE_CONFIG[activeCourse] : null;

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 z-20 relative">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href={`/organizer/event/${eventId}`} className="text-gray-400 hover:text-gray-700 text-sm transition">
            ← Tillbaka
          </Link>
          <div className="text-center">
            <div className="font-semibold text-gray-900">{eventName}</div>
            {data.couples.length > 0 && (
              <div className="text-xs text-gray-400">
                {data.couples.length} par
                {data.missingCoords.length > 0 && ` · ${data.missingCoords.length} saknar adress`}
              </div>
            )}
          </div>
          <div className="w-16" />
        </div>
      </header>

      {/* Course tabs */}
      {data.routes && (
        <div className="bg-white/95 backdrop-blur border-b border-gray-100 z-20 relative">
          <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-2">
            {COURSES.map((course) => {
              const active = activeCourse === course;
              const c = COURSE_CONFIG[course];
              const stats = courseStats[course];
              return (
                <button
                  key={course}
                  type="button"
                  onClick={() => toggleCourse(course)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'text-white shadow-lg scale-105'
                      : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200'
                  }`}
                  style={active ? { backgroundColor: c.color, boxShadow: `0 4px 14px ${c.color}40` } : undefined}
                >
                  <span>{c.emoji}</span>
                  <span>{c.label}</span>
                  <span className={`text-xs ${active ? 'text-white/80' : 'text-gray-400'}`}>
                    {c.time}
                  </span>
                  {stats.hosts > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {stats.hosts} värdar
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Map + info card */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* Meal Group Info Card */}
        {selectedGroup && activeCourse && cfg && (
          <div className="absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-180px)] overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {/* Card header */}
              <div className="px-5 py-4 border-b border-gray-100" style={{ backgroundColor: `${cfg.color}08` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cfg.emoji}</span>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: cfg.color }}>
                        {cfg.label} · {cfg.time}
                      </div>
                      <div className="font-semibold text-gray-900 text-sm mt-0.5">
                        Hos {selectedGroup.hostName.split(' & ')[0]}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={clearSelection}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Host */}
              <div className="px-5 py-3 border-b border-gray-50">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold mt-0.5" style={{ backgroundColor: cfg.color }}>
                    🏠
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{selectedGroup.hostName}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{selectedGroup.hostAddress}</div>
                    <div className="text-xs mt-1 px-2 py-0.5 rounded-full inline-block font-medium text-white" style={{ backgroundColor: cfg.color }}>
                      Värd · {selectedGroup.totalPeople} pers
                    </div>
                  </div>
                </div>
              </div>

              {/* Guests */}
              <div className="px-5 py-3">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Gäster som cyklar hit
                </div>
                <div className="space-y-3">
                  {selectedGroup.guests.map((guest) => {
                    const dist = haversineKm(guest.coords, selectedGroup.hostCoords);
                    const minutes = Math.round(dist / 0.25); // ~15 km/h
                    return (
                      <div key={guest.id} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs mt-0.5">
                          🚲
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800">{guest.name}</div>
                          <div className="text-xs text-gray-400">{guest.address}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            ~{dist < 0.1 ? '<100m' : `${dist.toFixed(1)} km`} · ~{minutes < 1 ? '<1' : minutes} min cykel
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {selectedGroup.guests.length === 0 && (
                    <div className="text-xs text-gray-400 italic">Inga gäster tilldelade</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legend (only when no group is selected) */}
        {!selectedGroup && activeCourse && cfg && (
          <div className="absolute bottom-6 left-4 z-10 bg-white/95 backdrop-blur rounded-xl shadow-sm border border-gray-200 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: cfg.color }} />
              <span className="text-gray-700">Värd</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-gray-400 inline-block" />
              <span className="text-gray-700">Gäst/Övriga</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: cfg.color, width: '16px' }} />
              <span className="text-gray-700">Cykelrutt</span>
            </div>
            <div className="text-xs text-gray-400 pt-1">Klicka på en prick för detaljer</div>
          </div>
        )}

        {/* Default legend when no course */}
        {!activeCourse && !selectedGroup && (
          <div className="absolute bottom-6 left-4 z-10 bg-white/95 backdrop-blur rounded-xl shadow-sm border border-gray-200 px-4 py-3 text-sm">
            <div className="text-gray-500">Välj en rätt ovan för att se matchningar</div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-white/90 rounded-xl px-4 py-2 text-sm text-gray-600 shadow">Laddar karta…</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-white rounded-xl px-4 py-2 text-sm text-red-600 shadow">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}
