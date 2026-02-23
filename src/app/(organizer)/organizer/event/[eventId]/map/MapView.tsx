'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HamburgerMenu } from '@/components/organizer/HamburgerMenu';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import type { FeatureCollection, Feature, LineString, Point } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MealGroupCard } from './MealGroupCard';
import type { Course, MapCouple, MapData, MealGroup, CourseConfig } from './types';
import { COURSES, DEFAULT_COURSE_CONFIG } from './types';

/* ── Constants ─────────────────────────────────────── */

const DEFAULT_CENTER: [number, number] = [18.06, 59.33];
const DEFAULT_TIMES: Record<Course, string> = { starter: '17:30', main: '19:00', dessert: '20:30' };

/** Haversine between two [lng,lat] */
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Total length of route geometry in km */
function routeDistanceKm(geometry: [number, number][] | null): number | null {
  if (!geometry || geometry.length < 2) return null;
  let total = 0;
  for (let i = 1; i < geometry.length; i++) total += haversineKm(geometry[i - 1], geometry[i]);
  return total;
}

/* ── Component ─────────────────────────────────────── */

function MapHeader({ eventId, eventName, coupleCount, missingCount }: { eventId: string; eventName: string; coupleCount: number; missingCount: number }) {
  const router = useRouter();
  return (
    <header className="bg-white border-b border-gray-200 z-20 relative">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 transition shrink-0" aria-label="Tillbaka">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 10H5M5 10l5-5M5 10l5 5" />
          </svg>
        </button>
        <div className="text-center flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate">{eventName}</div>
          {coupleCount > 0 && (
            <div className="text-xs text-gray-400">
              {coupleCount} par{missingCount > 0 && ` · ${missingCount} saknar adress`}
            </div>
          )}
        </div>
        <HamburgerMenu eventId={eventId} activePhase="matching" onPhaseChange={(view) => router.push(`/organizer/event/${eventId}?view=${view}`)} />
      </div>
    </header>
  );
}

export function MapView({ eventId, eventName }: { eventId: string; eventName: string }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [data, setData] = useState<MapData>({ couples: [], missingCoords: [], routes: null, outgoingRoutes: null, eventTimes: null, afterparty: null });
  const [activeCourse, setActiveCourse] = useState<Course | 'afterparty' | null>(null);
  const [selectedGroupHostId, setSelectedGroupHostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allBoundsRef = useRef<mapboxgl.LngLatBounds | null>(null);

  /* ── Course config with real event times ─────────── */

  const courseConfig = useMemo((): Record<Course, CourseConfig> => {
    const times = data.eventTimes || DEFAULT_TIMES;
    return {
      starter: { ...DEFAULT_COURSE_CONFIG.starter, time: times.starter },
      main: { ...DEFAULT_COURSE_CONFIG.main, time: times.main },
      dessert: { ...DEFAULT_COURSE_CONFIG.dessert, time: times.dessert },
    };
  }, [data.eventTimes]);

  /* ── Build meal groups per course ───────────────── */

  const mealGroups = useMemo(() => {
    const result: Record<Course, MealGroup[]> = { starter: [], main: [], dessert: [] };
    if (!data.routes) return result;

    const byId = new Map(data.couples.map((c) => [c.id, c]));

    // First pass: build groups per course
    COURSES.forEach((course) => {
      const groupMap = new Map<string, MealGroup>();
      (data.routes![course] || []).forEach((seg) => {
        const host = byId.get(seg.hostId);
        const guest = byId.get(seg.guestId);
        if (!host) return;

        if (!groupMap.has(seg.hostId)) {
          groupMap.set(seg.hostId, {
            hostId: seg.hostId,
            hostName: host.name,
            hostAddress: host.address,
            hostCoords: [host.lng, host.lat],
            hostAllergies: host.allergies || [],
            guests: [],
            hostNextAddress: null,
            hostNextHostName: null,
            totalPeople: host.personCount,
          });
        }
        const g = groupMap.get(seg.hostId)!;
        if (guest && !g.guests.find((x) => x.id === seg.guestId)) {
          g.guests.push({
            id: seg.guestId,
            name: guest.name,
            address: guest.address,
            coords: [guest.lng, guest.lat],
            allergies: guest.allergies || [],
            routeDistanceKm: routeDistanceKm(seg.geometry),
            fromAddress: seg.fromAddress || guest.address,
            fromHostName: seg.fromHostName || null,
            fromCoords: seg.from,
            toAddress: null,
            toHostName: null,
            toCoords: null,
            toDistanceKm: null,
          });
          g.totalPeople += guest.personCount;
        }
      });
      result[course] = Array.from(groupMap.values()).sort((a, b) => a.hostName.localeCompare(b.hostName));
    });

    // Second pass: fill in "next destination" from the following course's routes
    const courseOrder: Course[] = ['starter', 'main', 'dessert'];
    for (let ci = 0; ci < courseOrder.length; ci++) {
      const course = courseOrder[ci];
      const nextCourse = courseOrder[ci + 1]; // undefined for dessert

      // Build lookup: coupleId → where they go in the next course
      // If they're a GUEST → they go to their host
      // If they're a HOST → they stay at their own home
      const nextDestFor = new Map<string, { name: string; address: string; coords: [number, number]; isHome: boolean }>();

      if (nextCourse && data.routes![nextCourse]) {
        // First: mark all hosts in next course → they go home (stay home)
        const nextHosts = new Set<string>();
        for (const seg of data.routes![nextCourse]) {
          if (!nextHosts.has(seg.hostId)) {
            nextHosts.add(seg.hostId);
            const host = byId.get(seg.hostId);
            if (host) {
              nextDestFor.set(seg.hostId, {
                name: host.name,
                address: host.address,
                coords: [host.lng, host.lat],
                isHome: true,
              });
            }
          }
        }

        // Then: all guests in next course → they go to their host
        for (const seg of data.routes![nextCourse]) {
          const host = byId.get(seg.hostId);
          if (host) {
            nextDestFor.set(seg.guestId, {
              name: host.name,
              address: host.address,
              coords: [host.lng, host.lat],
              isHome: false,
            });
          }
        }
      }

      for (const group of result[course]) {
        // Where does the host go next?
        const hostNext = nextDestFor.get(group.hostId);
        if (hostNext) {
          group.hostNextAddress = hostNext.address;
          group.hostNextHostName = hostNext.isHome ? null : hostNext.name;
        } else {
          // No next course (dessert) or not found → home
          group.hostNextAddress = group.hostAddress;
          group.hostNextHostName = null;
        }

        // Where does each guest go next?
        const courseOutgoing = data.outgoingRoutes?.[course] || {};
        for (const guest of group.guests) {
          const guestNext = nextDestFor.get(guest.id);
          // Get cycling distance from outgoing routes
          const outRoute = courseOutgoing[guest.id];
          const cyclingDist = outRoute?.geometry ? routeDistanceKm(outRoute.geometry) : null;

          if (guestNext) {
            guest.toAddress = guestNext.address;
            guest.toHostName = guestNext.isHome ? null : guestNext.name;
            guest.toCoords = guestNext.coords;
            guest.toDistanceKm = cyclingDist ?? haversineKm(group.hostCoords, guestNext.coords);
          } else {
            // No next course or not found → home
            guest.toAddress = guest.address;
            guest.toHostName = null;
            guest.toCoords = guest.coords;
            guest.toDistanceKm = cyclingDist ?? haversineKm(group.hostCoords, guest.coords);
          }
        }
      }
    }
    return result;
  }, [data]);

  /* ── Selected group derived state ───────────────── */

  const selectedGroup = useMemo(() => {
    if (!selectedGroupHostId || !activeCourse || activeCourse === 'afterparty') return null;
    return mealGroups[activeCourse].find((g: MealGroup) => g.hostId === selectedGroupHostId) || null;
  }, [selectedGroupHostId, activeCourse, mealGroups]);

  const selectedGroupIds = useMemo(() => {
    if (!selectedGroup) return null;
    const ids = new Set<string>();
    ids.add(selectedGroup.hostId);
    selectedGroup.guests.forEach((g: { id: string }) => ids.add(g.id));
    return ids;
  }, [selectedGroup]);

  const selectedGroupIndex = useMemo(() => {
    if (!selectedGroup || !activeCourse || activeCourse === 'afterparty') return -1;
    return mealGroups[activeCourse].findIndex((g: MealGroup) => g.hostId === selectedGroup.hostId);
  }, [selectedGroup, activeCourse, mealGroups]);

  /* ── Find meal group for any couple ─────────────── */

  const findGroupHostId = useCallback((coupleId: string, course: Course): string | null => {
    const groups = mealGroups[course];
    for (const g of groups) {
      if (g.hostId === coupleId) return g.hostId;
      if (g.guests.some((x) => x.id === coupleId)) return g.hostId;
    }
    return null;
  }, [mealGroups]);

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

  const hostFeatures = useMemo(() => {
    const result: Record<Course, FeatureCollection<Point>> = {
      starter: { type: 'FeatureCollection', features: [] },
      main: { type: 'FeatureCollection', features: [] },
      dessert: { type: 'FeatureCollection', features: [] },
    };
    if (!data.routes) return result;
    const byId = new Map(data.couples.map((c) => [c.id, c]));
    COURSES.forEach((course) => {
      const seen = new Set<string>();
      result[course] = {
        type: 'FeatureCollection',
        features: (data.routes![course] || []).reduce<Feature<Point>[]>((acc, seg) => {
          if (seen.has(seg.hostId)) return acc;
          seen.add(seg.hostId);
          const host = byId.get(seg.hostId);
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
    const stats: Record<Course, number> = { starter: 0, main: 0, dessert: 0 };
    COURSES.forEach((course) => { stats[course] = mealGroups[course].length; });
    return stats;
  }, [mealGroups]);

  /* ── Refs for stable click handlers ─────────────── */

  const activeCourseRef = useRef(activeCourse);
  activeCourseRef.current = activeCourse;
  const findGroupHostIdRef = useRef(findGroupHostId);
  findGroupHostIdRef.current = findGroupHostId;

  /* ── Actions ────────────────────────────────────── */

  const toggleCourse = useCallback((course: Course | 'afterparty') => {
    setActiveCourse((prev) => prev === course ? null : course);
    setSelectedGroupHostId(null);
  }, []);

  const handlePinClick = useCallback((coupleId: string) => {
    const course = activeCourseRef.current;
    if (!course || course === 'afterparty') return;
    const hostId = findGroupHostIdRef.current(coupleId, course);
    if (!hostId) return;
    setSelectedGroupHostId((prev) => prev === hostId ? null : hostId);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedGroupHostId(null);
    // Zoom back to all pins
    if (mapRef.current && allBoundsRef.current) {
      mapRef.current.fitBounds(allBoundsRef.current, { padding: 80, duration: 600 });
    }
  }, []);

  const navigateGroup = useCallback((dir: 1 | -1) => {
    if (!activeCourse || activeCourse === 'afterparty') return;
    const groups = mealGroups[activeCourse];
    const idx = groups.findIndex((g: MealGroup) => g.hostId === selectedGroupHostId);
    if (idx < 0) return;
    const next = idx + dir;
    if (next >= 0 && next < groups.length) {
      setSelectedGroupHostId(groups[next].hostId);
    }
  }, [activeCourse, mealGroups, selectedGroupHostId]);

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

  /* ── Auto-select course based on current time ───── */

  useEffect(() => {
    if (!data.routes || !data.eventTimes || activeCourse) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    function toMinutes(timeStr: string): number {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    }

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const times = data.eventTimes!;
    const starterMin = toMinutes(times.starter);
    const mainMin = toMinutes(times.main);
    const dessertMin = toMinutes(times.dessert);

    // Auto-select: current time falls within course window (+15 min grace)
    if (nowMin <= starterMin + 15) {
      setActiveCourse('starter');
    } else if (nowMin <= mainMin + 15) {
      setActiveCourse('main');
    } else if (nowMin <= dessertMin + 15) {
      setActiveCourse('dessert');
    } else {
      // Past all courses — show dessert
      setActiveCourse('dessert');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.routes, data.eventTimes]);

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
      map.addSource('couples', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Clusters
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

      COURSES.forEach((course) => {
        const color = DEFAULT_COURSE_CONFIG[course].color;

        // Routes
        map.addSource(`route-${course}`, { type: 'geojson', data: empty });
        map.addLayer({
          id: `route-${course}-line`, type: 'line', source: `route-${course}`,
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.25, 'line-dasharray': [2, 2] },
        });
        map.addLayer({
          id: `route-${course}-bold`, type: 'line', source: `route-${course}`,
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
          paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.85 },
          filter: ['==', 'hostId', '__none__'],
        });

        // Hosts
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
        map.addLayer({
          id: `host-${course}-label`, type: 'symbol', source: `host-${course}`,
          layout: { visibility: 'none', 'text-field': '🏠', 'text-size': 11, 'text-allow-overlap': true },
        });
      });

      // Default pins (on top)
      map.addLayer({
        id: 'unclustered-point', type: 'circle', source: 'couples',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 8,
          'circle-color': '#475569',
          'circle-opacity': 0.7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });

      // Afterparty routes + marker
      map.addSource('afterparty-routes', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'afterparty-routes-line', type: 'line', source: 'afterparty-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
        paint: { 'line-color': '#ec4899', 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [2, 2] },
      });
      map.addSource('afterparty-point', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'afterparty-circle', type: 'circle', source: 'afterparty-point',
        paint: { 'circle-radius': 14, 'circle-color': '#ec4899', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' },
      });
      map.addLayer({
        id: 'afterparty-marker', type: 'symbol', source: 'afterparty-point',
        layout: { 'text-field': '🎉', 'text-size': 20, 'text-allow-overlap': true },
      });

      // --- Click handlers (use closure-safe pattern) ---

      // Track which layers got clicked to prevent background handler from firing
      let clickHandled = false;

      map.on('click', 'clusters', (e) => {
        clickHandled = true;
        const f = e.features?.[0];
        const clusterId = f?.properties?.cluster_id;
        if (clusterId == null) return;
        (map.getSource('couples') as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          map.easeTo({ center: (f!.geometry as any).coordinates, zoom });
        });
      });

      map.on('click', 'unclustered-point', (e) => {
        clickHandled = true;
        const f = e.features?.[0];
        if (f) handlePinClick(f.properties?.id);
      });

      COURSES.forEach((course) => {
        map.on('click', `host-${course}-fill`, (e) => {
          clickHandled = true;
          const f = e.features?.[0];
          if (f) handlePinClick(f.properties?.hostId);
        });
        map.on('mouseenter', `host-${course}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', `host-${course}-fill`, () => { map.getCanvas().style.cursor = ''; });
      });

      // Background click — deselect and zoom back to all pins
      map.on('click', () => {
        // Delay to let layer handlers set clickHandled
        setTimeout(() => {
          if (!clickHandled) {
            clearSelection();
          }
          clickHandled = false;
        }, 0);
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

  /* ── Sync data → map ────────────────────────────── */

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    (map.getSource('couples') as mapboxgl.GeoJSONSource | undefined)?.setData(featureCollection as any);

    COURSES.forEach((course) => {
      (map.getSource(`route-${course}`) as mapboxgl.GeoJSONSource | undefined)?.setData(routeFeatures[course] as any);
      (map.getSource(`host-${course}`) as mapboxgl.GeoJSONSource | undefined)?.setData(hostFeatures[course] as any);
    });

    // Afterparty data
    if (data.afterparty) {
      const apRouteFC: FeatureCollection<LineString> = {
        type: 'FeatureCollection',
        features: data.afterparty.routes.map(r => ({
          type: 'Feature' as const,
          properties: { hostName: r.hostName },
          geometry: { type: 'LineString' as const, coordinates: r.geometry ?? [r.from, r.to] },
        })),
      };
      (map.getSource('afterparty-routes') as mapboxgl.GeoJSONSource | undefined)?.setData(apRouteFC as any);

      const apPointFC: FeatureCollection<Point> = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { title: data.afterparty.title },
          geometry: { type: 'Point', coordinates: [data.afterparty.lng, data.afterparty.lat] },
        }],
      };
      (map.getSource('afterparty-point') as mapboxgl.GeoJSONSource | undefined)?.setData(apPointFC as any);
    }

    if (featureCollection.features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      featureCollection.features.forEach((f) => bounds.extend(f.geometry.coordinates as [number, number]));
      allBoundsRef.current = bounds;
      map.fitBounds(bounds, { padding: 80, duration: 800 });
    }
  }, [featureCollection, routeFeatures, hostFeatures, mapLoaded]);

  /* ── Visual state machine ───────────────────────── */

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // State: which course layers are visible
    COURSES.forEach((course) => {
      const vis = activeCourse === course ? 'visible' : 'none';
      for (const suffix of ['line', 'bold']) {
        if (map.getLayer(`route-${course}-${suffix}`))
          map.setLayoutProperty(`route-${course}-${suffix}`, 'visibility', vis);
      }
      for (const suffix of ['fill', 'label']) {
        if (map.getLayer(`host-${course}-${suffix}`))
          map.setLayoutProperty(`host-${course}-${suffix}`, 'visibility', vis);
      }
    });

    // Afterparty layers
    const apVis = activeCourse === 'afterparty' ? 'visible' : 'none';
    if (map.getLayer('afterparty-routes-line')) map.setLayoutProperty('afterparty-routes-line', 'visibility', apVis);
    // Afterparty pin always visible (routes only when tab active)
    if (map.getLayer('afterparty-circle')) map.setLayoutProperty('afterparty-circle', 'visibility', 'visible');
    if (map.getLayer('afterparty-marker')) map.setLayoutProperty('afterparty-marker', 'visibility', 'visible');

    if (selectedGroup && activeCourse) {
      // === STATE: Group selected ===
      const ids = Array.from(selectedGroupIds || []);

      // Bold only this group
      map.setFilter(`route-${activeCourse}-bold`, ['==', ['get', 'hostId'], selectedGroup.hostId]);
      map.setPaintProperty(`route-${activeCourse}-line`, 'line-opacity', 0.08);

      // Dim everything except group
      map.setPaintProperty('unclustered-point', 'circle-opacity',
        ['case', ['in', ['get', 'id'], ['literal', ids]], 0.9, 0.08]);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity',
        ['case', ['in', ['get', 'id'], ['literal', ids]], 1, 0.08]);
      map.setPaintProperty('unclustered-point', 'circle-radius',
        ['case', ['in', ['get', 'id'], ['literal', ids]], 10, 3]);
      map.setPaintProperty('unclustered-point', 'circle-stroke-width',
        ['case', ['in', ['get', 'id'], ['literal', ids]], 3, 1]);

      // Dim other hosts
      map.setPaintProperty(`host-${activeCourse}-fill`, 'circle-opacity',
        ['case', ['==', ['get', 'hostId'], selectedGroup.hostId], 1, 0.12]);
      map.setPaintProperty(`host-${activeCourse}-fill`, 'circle-stroke-opacity',
        ['case', ['==', ['get', 'hostId'], selectedGroup.hostId], 1, 0.12]);

      // Zoom to group — mobile needs bottom padding for drawer peek
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(selectedGroup.hostCoords);
      selectedGroup.guests.forEach((g) => bounds.extend(g.coords));
      const isMobile = window.innerWidth < 768;
      map.fitBounds(bounds, {
        padding: {
          top: 80,
          bottom: isMobile ? 140 : 80,  // Room for drawer peek
          left: isMobile ? 40 : 380,
          right: 40,
        },
        duration: 500,
        maxZoom: 16,
      });

    } else if (activeCourse) {
      // === STATE: Course active, no selection ===
      map.setFilter(`route-${activeCourse}-bold`, ['==', 'hostId', '__none__']);
      map.setPaintProperty(`route-${activeCourse}-line`, 'line-opacity', 0.25);

      map.setPaintProperty('unclustered-point', 'circle-opacity', 0.25);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', 0.25);
      map.setPaintProperty('unclustered-point', 'circle-radius', 5);

      map.setPaintProperty(`host-${activeCourse}-fill`, 'circle-opacity', 0.9);
      map.setPaintProperty(`host-${activeCourse}-fill`, 'circle-stroke-opacity', 1);

    } else {
      // === STATE: Idle (no course) ===
      map.setPaintProperty('unclustered-point', 'circle-opacity', 0.7);
      map.setPaintProperty('unclustered-point', 'circle-stroke-opacity', 1);
      map.setPaintProperty('unclustered-point', 'circle-radius', 6);
    }
  }, [selectedGroup, selectedGroupIds, activeCourse, mapLoaded]);

  /* ── Render ─────────────────────────────────────── */

  const isCourse = activeCourse && activeCourse !== 'afterparty';
  const cfg = isCourse ? courseConfig[activeCourse] : null;
  const groups = isCourse ? mealGroups[activeCourse] : [];

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <MapHeader eventId={eventId} eventName={eventName} coupleCount={data.couples.length} missingCount={data.missingCoords.length} />

      {/* Course tabs */}
      {data.routes && (
        <div className="bg-white/95 backdrop-blur border-b border-gray-100 z-20 relative">
          <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-2 overflow-x-auto">
            {COURSES.map((course) => {
              const active = activeCourse === course;
              const c = courseConfig[course];
              const count = courseStats[course];
              return (
                <button
                  key={course}
                  type="button"
                  onClick={() => toggleCourse(course)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 shrink-0 ${
                    active
                      ? 'text-white shadow-lg scale-105'
                      : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200'
                  }`}
                  style={active ? { backgroundColor: c.color, boxShadow: `0 4px 14px ${c.color}40` } : undefined}
                >
                  <span>{c.emoji}</span>
                  <span>{c.label}</span>
                  <span className={`text-xs ${active ? 'text-white/80' : 'text-gray-400'}`}>{c.time}</span>
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {count} värdar
                    </span>
                  )}
                </button>
              );
            })}
            {data.afterparty && (
              <button
                type="button"
                onClick={() => toggleCourse('afterparty')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 shrink-0 ${
                  activeCourse === 'afterparty'
                    ? 'text-white shadow-lg scale-105 bg-pink-500'
                    : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200'
                }`}
                style={activeCourse === 'afterparty' ? { boxShadow: '0 4px 14px rgba(236,72,153,0.4)' } : undefined}
              >
                <span>🎉</span>
                <span>Efterfest</span>
                <span className={`text-xs ${activeCourse === 'afterparty' ? 'text-white/80' : 'text-gray-400'}`}>
                  {data.afterparty.routes.length} rutter
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Map + overlays */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {/* Meal Group Info Card */}
        {selectedGroup && activeCourse && cfg && (
          <MealGroupCard
            group={selectedGroup}
            cfg={cfg}
            courseName={cfg.label}
            onClose={clearSelection}
            onPrev={selectedGroupIndex > 0 ? () => navigateGroup(-1) : null}
            onNext={selectedGroupIndex < groups.length - 1 ? () => navigateGroup(1) : null}
            groupIndex={selectedGroupIndex}
            groupTotal={groups.length}
          />
        )}

        {/* Legend */}
        {!selectedGroup && activeCourse && cfg && (
          <div className="absolute bottom-6 left-4 z-10 bg-white/95 backdrop-blur rounded-xl shadow-sm border border-gray-200 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: cfg.color }} />
              <span className="text-gray-700">Värd</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-gray-400 inline-block" />
              <span className="text-gray-700">Gäst</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: cfg.color, width: '16px' }} />
              <span className="text-gray-700">Cykelrutt</span>
            </div>
            <div className="text-xs text-gray-400 pt-1">Klicka på en prick för detaljer</div>
          </div>
        )}

        {!activeCourse && !selectedGroup && data.couples.length > 0 && (
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
