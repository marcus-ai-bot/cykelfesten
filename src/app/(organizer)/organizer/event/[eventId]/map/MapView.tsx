'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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

interface MapData {
  couples: MapCouple[];
  missingCoords: MissingCoords[];
}

interface Props {
  eventId: string;
  eventName: string;
}

const DEFAULT_CENTER: [number, number] = [18.06, 59.33];

export function MapView({ eventId, eventName }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [data, setData] = useState<MapData>({ couples: [], missingCoords: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const featureCollection = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: data.couples.map((c) => ({
      type: 'Feature' as const,
      properties: {
        id: c.id,
        name: c.name,
        address: c.address,
        isHost: c.isHost,
        isConfirmed: c.isConfirmed,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [c.lng, c.lat] as [number, number],
      },
    })),
  }), [data.couples]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch(`/api/organizer/events/${eventId}/map-data`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Kunde inte hämta kartdata');
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        setData(json);
        setError(null);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [eventId]);

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

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'couples',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#94a3b8',
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16,
            10,
            20,
            30,
            26,
          ],
          'circle-opacity': 0.8,
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'couples',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#0f172a',
        },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'couples',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'case',
            ['==', ['get', 'isConfirmed'], false],
            '#ffffff',
            ['==', ['get', 'isHost'], true],
            '#16a34a',
            '#2563eb',
          ],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'isConfirmed'], false],
            '#9ca3af',
            '#ffffff',
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'isConfirmed'], false],
            2,
            1,
          ],
        },
      });

      map.on('click', 'clusters', (event) => {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ['clusters'],
        });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId == null) return;

        const source = map.getSource('couples') as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          map.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
        });
      });

      map.on('click', 'unclustered-point', (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const coordinates = (feature.geometry as any).coordinates.slice();
        const { name, address } = feature.properties as any;

        new mapboxgl.Popup({ offset: 12 })
          .setLngLat(coordinates)
          .setHTML(`
            <div style="font-weight:600; margin-bottom:4px;">${name}</div>
            <div style="font-size:12px; color:#475569;">${address}</div>
          `)
          .addTo(map);
      });

      map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', 'unclustered-point', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'unclustered-point', () => {
        map.getCanvas().style.cursor = '';
      });

      setMapLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const source = mapRef.current.getSource('couples') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData(featureCollection);

    if (featureCollection.features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      featureCollection.features.forEach((feature) => {
        bounds.extend(feature.geometry.coordinates as [number, number]);
      });
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 800 });
    }
  }, [featureCollection, mapLoaded]);

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href={`/organizer/event/${eventId}`} className="text-gray-500 hover:text-gray-700">
            ← Tillbaka
          </Link>
          <div className="text-sm font-semibold text-gray-900">{eventName}</div>
          <div />
        </div>
      </header>

      {data.missingCoords.length > 0 && (
        <div className="bg-amber-50 text-amber-900 border-b border-amber-100">
          <div className="max-w-6xl mx-auto px-4 py-2 text-sm font-medium">
            {data.missingCoords.length} par saknar koordinater
          </div>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-xl shadow-sm border border-gray-200 px-3 py-2 text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span>🟢</span>
            <span>Värd</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🔵</span>
            <span>Gäst</span>
          </div>
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
