import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import type { Coordinates } from '@/lib/geo';

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

function parsePoint(point: unknown): Coordinates | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const match = point.match(/\(([^,]+),([^)]+)\)/);
    if (match) return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as Record<string, unknown>;
    if (p.lat != null && p.lng != null) return { lat: Number(p.lat), lng: Number(p.lng) };
  }
  return null;
}

function applyJitter(items: Array<{ lat: number; lng: number }>, radiusMeters = 15) {
  const groups = new Map<string, number[]>();
  items.forEach((item, i) => {
    const key = `${item.lat.toFixed(7)},${item.lng.toFixed(7)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });
  const latOffset = radiusMeters / 111_320;
  const lngOffset = radiusMeters / (111_320 * Math.cos((items[0]?.lat ?? 65) * Math.PI / 180));
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const n = indices.length;
    indices.forEach((idx, i) => {
      const angle = (2 * Math.PI * i) / n;
      items[idx].lat += latOffset * Math.sin(angle);
      items[idx].lng += lngOffset * Math.cos(angle);
    });
  }
}

/**
 * Fetch cycling route geometry from Mapbox Directions API.
 * Returns array of [lng,lat] coordinates, or null on failure.
 */
async function fetchCyclingRoute(
  from: [number, number],
  to: [number, number],
  token: string
): Promise<[number, number][] | null> {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.routes?.[0]?.geometry?.coordinates ?? null;
  } catch {
    return null;
  }
}

/**
 * Batch fetch cycling routes with concurrency limit.
 */
async function batchFetchRoutes(
  segments: Array<{ from: [number, number]; to: [number, number] }>,
  token: string,
  concurrency = 5
): Promise<([number, number][] | null)[]> {
  const results: ([number, number][] | null)[] = new Array(segments.length).fill(null);
  let idx = 0;

  async function worker() {
    while (idx < segments.length) {
      const i = idx++;
      results[i] = await fetchCyclingRoute(segments[i].from, segments[i].to, token);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, () => worker()));
  return results;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { eventId } = await context.params;

    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();

    // Fetch event for times
    const { data: event } = await supabase
      .from('events')
      .select('id, name, starter_time, main_time, dessert_time, afterparty_coordinates, afterparty_title, afterparty_location')
      .eq('id', eventId)
      .single();

    const { data: couples, error } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, address, coordinates, role, confirmed, person_count, invited_allergies, partner_allergies')
      .eq('event_id', eventId)
      .order('invited_name');

    if (error) {
      console.error('Supabase error in map-data:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const withCoords: Array<{
      id: string; name: string; address: string; lat: number; lng: number;
      isHost: boolean; isConfirmed: boolean; personCount: number;
      allergies: string[];
    }> = [];
    const missingCoords: Array<{ id: string; name: string; address: string }> = [];

    (couples || []).forEach((c: any) => {
      const name = c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : '');
      const coords = parsePoint(c.coordinates);
      const allergies = [
        ...(c.invited_allergies || []),
        ...(c.partner_allergies || []),
      ].filter(Boolean);
      if (coords) {
        withCoords.push({
          id: c.id, name, address: c.address,
          lat: coords.lat, lng: coords.lng,
          isHost: c.role === 'host',
          isConfirmed: !!c.confirmed,
          personCount: c.person_count ?? (c.partner_name ? 2 : 1),
          allergies,
        });
      } else {
        missingCoords.push({ id: c.id, name, address: c.address });
      }
    });

    applyJitter(withCoords);

    // Fetch latest match plan
    const { data: latestPlan } = await supabase
      .from('match_plans')
      .select('id')
      .eq('event_id', eventId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    type Segment = {
      from: [number, number];
      to: [number, number];
      geometry: [number, number][] | null;
      guestName: string;
      hostName: string;
      guestId: string;
      hostId: string;
      /** Where the guest is coming from (for main/dessert: previous host) */
      fromAddress: string;
      fromHostName: string | null; // null for starter (coming from home)
    };

    let routes: { starter: Segment[]; main: Segment[]; dessert: Segment[] } | null = null;
    let outgoingRoutes: Record<string, Record<string, { geometry: [number, number][] | null; to: [number, number] }>> | null = null;

    if (latestPlan?.id) {
      const { data: pairings } = await supabase
        .from('course_pairings')
        .select('course, host_couple_id, guest_couple_id')
        .eq('match_plan_id', latestPlan.id);

      const byId = new Map(withCoords.map((c) => [c.id, c]));

      // Build journey chain: for each couple, track their host per course
      // coupleId → { starter: hostCoupleId, main: hostCoupleId, dessert: hostCoupleId }
      const journeys = new Map<string, Record<string, string>>();
      (pairings || []).forEach((p: any) => {
        if (!journeys.has(p.guest_couple_id)) journeys.set(p.guest_couple_id, {});
        journeys.get(p.guest_couple_id)![p.course] = p.host_couple_id;
      });

      const courseOrder: Array<{ course: string; prevCourse: string | null }> = [
        { course: 'starter', prevCourse: null },
        { course: 'main', prevCourse: 'starter' },
        { course: 'dessert', prevCourse: 'main' },
      ];

      const allSegments: Array<Segment & { course: string }> = [];

      courseOrder.forEach(({ course, prevCourse }) => {
        (pairings || [])
          .filter((p: any) => p.course === course)
          .forEach((p: any) => {
            const guest = byId.get(p.guest_couple_id);
            const host = byId.get(p.host_couple_id);
            if (!guest || !host) return;

            let fromCoords: [number, number];
            let fromAddress: string;
            let fromHostName: string | null = null;

            if (prevCourse) {
              // Chain routing: start from previous course's host
              const prevHostId = journeys.get(p.guest_couple_id)?.[prevCourse];
              const prevHost = prevHostId ? byId.get(prevHostId) : null;
              if (prevHost) {
                fromCoords = [prevHost.lng, prevHost.lat];
                fromAddress = prevHost.address;
                fromHostName = prevHost.name;
              } else {
                // Fallback: use guest's home (shouldn't happen if data is complete)
                fromCoords = [guest.lng, guest.lat];
                fromAddress = guest.address;
              }
            } else {
              // Starter: start from home
              fromCoords = [guest.lng, guest.lat];
              fromAddress = guest.address;
            }

            allSegments.push({
              course,
              from: fromCoords,
              to: [host.lng, host.lat],
              geometry: null,
              guestName: guest.name,
              hostName: host.name,
              guestId: guest.id,
              hostId: host.id,
              fromAddress,
              fromHostName,
            });
          });
      });

      // Build "outgoing" segments: from current host → next destination
      // These are used for "Ska till" distances in the card
      type OutgoingSegment = {
        coupleId: string;
        course: string;
        from: [number, number];
        to: [number, number];
        geometry: [number, number][] | null;
      };
      const outgoingSegments: OutgoingSegment[] = [];

      const courseNames = ['starter', 'main', 'dessert'];
      for (let ci = 0; ci < courseNames.length; ci++) {
        const course = courseNames[ci];
        const nextCourse = courseNames[ci + 1];

        // For each couple, find where they are NOW (at their host) and where they go NEXT
        (pairings || [])
          .filter((p: any) => p.course === course)
          .forEach((p: any) => {
            const host = byId.get(p.host_couple_id);
            const guest = byId.get(p.guest_couple_id);
            if (!host || !guest) return;

            const fromCoords: [number, number] = [host.lng, host.lat];

            if (nextCourse) {
              // Where does this guest go in the next course?
              const nextHostId = journeys.get(p.guest_couple_id)?.[nextCourse];
              const nextHost = nextHostId ? byId.get(nextHostId) : null;
              if (nextHost) {
                outgoingSegments.push({
                  coupleId: p.guest_couple_id,
                  course,
                  from: fromCoords,
                  to: [nextHost.lng, nextHost.lat],
                  geometry: null,
                });
              } else {
                // Guest is HOST in next course → goes home
                outgoingSegments.push({
                  coupleId: p.guest_couple_id,
                  course,
                  from: fromCoords,
                  to: [guest.lng, guest.lat],
                  geometry: null,
                });
              }
            } else {
              // After dessert → everyone goes home
              outgoingSegments.push({
                coupleId: p.guest_couple_id,
                course,
                from: fromCoords,
                to: [guest.lng, guest.lat],
                geometry: null,
              });
            }
          });

        // Also: where does each HOST go next?
        const hostIds = new Set<string>();
        (pairings || [])
          .filter((p: any) => p.course === course)
          .forEach((p: any) => {
            if (hostIds.has(p.host_couple_id)) return;
            hostIds.add(p.host_couple_id);
            const host = byId.get(p.host_couple_id);
            if (!host) return;

            const fromCoords: [number, number] = [host.lng, host.lat];

            if (nextCourse) {
              const nextHostId = journeys.get(p.host_couple_id)?.[nextCourse];
              const nextHost = nextHostId ? byId.get(nextHostId) : null;
              if (nextHost) {
                outgoingSegments.push({
                  coupleId: p.host_couple_id,
                  course,
                  from: fromCoords,
                  to: [nextHost.lng, nextHost.lat],
                  geometry: null,
                });
              }
              // If host is also host in next course → stays home, no route needed
            } else {
              // Dessert host → stays home, no route needed
            }
          });
      }

      // Fetch real cycling routes from Mapbox Directions (incoming + outgoing)
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (mapboxToken) {
        // Incoming routes
        if (allSegments.length > 0) {
          const geometries = await batchFetchRoutes(
            allSegments.map((s) => ({ from: s.from, to: s.to })),
            mapboxToken,
            5
          );
          geometries.forEach((geo, i) => {
            allSegments[i].geometry = geo;
          });
        }
        // Outgoing routes
        if (outgoingSegments.length > 0) {
          const outGeos = await batchFetchRoutes(
            outgoingSegments.map((s) => ({ from: s.from, to: s.to })),
            mapboxToken,
            5
          );
          outGeos.forEach((geo, i) => {
            outgoingSegments[i].geometry = geo;
          });
        }
      }

      routes = { starter: [], main: [], dessert: [] };
      allSegments.forEach((s) => {
        const { course, ...segment } = s;
        if (course === 'starter') routes!.starter.push(segment);
        if (course === 'main') routes!.main.push(segment);
        if (course === 'dessert') routes!.dessert.push(segment);
      });

      // Attach outgoing route data to response
      const outgoing: Record<string, Record<string, { geometry: [number, number][] | null; to: [number, number] }>> = {};
      outgoingSegments.forEach((s) => {
        if (!outgoing[s.course]) outgoing[s.course] = {};
        outgoing[s.course][s.coupleId] = { geometry: s.geometry, to: s.to };
      });
      outgoingRoutes = outgoing;
    }

    // Parse afterparty coordinates and compute routes from dessert hosts → afterparty
    const afterpartyCoords = event ? parsePoint(event.afterparty_coordinates) : null;
    let afterpartyRoutes: Array<{ hostId: string; hostName: string; from: [number, number]; to: [number, number]; geometry: [number, number][] | null }> = [];

    const apToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (afterpartyCoords && routes?.dessert && apToken) {
      // Get unique dessert hosts
      const dessertHostIds = new Set(routes.dessert.map(r => r.hostId));
      const hostCoordMap = new Map(withCoords.map((c) => [c.id, [c.lng, c.lat] as [number, number]]));
      const hostNameMap = new Map(withCoords.map((c) => [c.id, c.name]));

      const apTo: [number, number] = [afterpartyCoords.lng, afterpartyCoords.lat];
      const apSegments: Array<{ from: [number, number]; to: [number, number] }> = [];
      const apHosts: string[] = [];

      for (const hostId of dessertHostIds) {
        const from = hostCoordMap.get(hostId);
        if (from) {
          apSegments.push({ from, to: apTo });
          apHosts.push(hostId);
        }
      }

      if (apSegments.length > 0) {
        const geos = await batchFetchRoutes(apSegments, apToken, 5);
        afterpartyRoutes = apHosts.map((hostId, i) => ({
          hostId,
          hostName: hostNameMap.get(hostId) || '?',
          from: apSegments[i].from,
          to: apTo,
          geometry: geos[i],
        }));
      }
    }

    return NextResponse.json({
      couples: withCoords,
      missingCoords,
      routes,
      outgoingRoutes,
      eventTimes: event ? {
        starter: event.starter_time?.slice(0, 5) || '17:30',
        main: event.main_time?.slice(0, 5) || '19:00',
        dessert: event.dessert_time?.slice(0, 5) || '20:30',
      } : null,
      afterparty: afterpartyCoords ? {
        lat: afterpartyCoords.lat,
        lng: afterpartyCoords.lng,
        title: event?.afterparty_title || 'Efterfesten',
        location: event?.afterparty_location || '',
        routes: afterpartyRoutes,
      } : null,
    });
  } catch (err: any) {
    console.error('map-data route error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
