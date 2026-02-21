'use client';

import { useState } from 'react';

interface PairwiseDistance {
  from_id: string;
  from_name: string;
  from_address: string;
  to_id: string;
  to_name: string;
  to_address: string;
  distance_km: number;
  duration_min?: number;
  source: 'cycling' | 'haversine';
}

interface DistanceCheckResult {
  warnings: PairwiseDistance[];
  pairwise_distances: PairwiseDistance[];
  stats: {
    max_km: number;
    min_km: number;
    avg_km: number;
    total_pairs: number;
  };
  distance_source: 'cycling' | 'haversine';
  distance_source_label: string;
  geocoded: number;
  total: number;
  not_geocoded: { id: string; name: string; address: string }[];
}

interface Props {
  eventId: string;
}

export function DistanceWarnings({ eventId }: Props) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DistanceCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  
  async function checkDistances() {
    setChecking(true);
    setError(null);
    
    try {
      const res = await fetch('/api/admin/check-distances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, max_distance_km: 5 }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Kunde inte kontrollera avstånd');
      }
      
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }
  
  return (
    <div className="bg-white rounded-xl p-6 shadow mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">📍 Avståndskontroll</h2>
        <button
          onClick={checkDistances}
          disabled={checking}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
        >
          {checking ? 'Kontrollerar...' : 'Kontrollera avstånd'}
        </button>
      </div>
      
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg mb-4">
          ❌ {error}
        </div>
      )}
      
      {result && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="flex flex-wrap gap-3 text-sm">
            <div className={`px-3 py-2 rounded-lg ${
              result.distance_source === 'cycling' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
              {result.distance_source_label}
            </div>
            <div className="px-3 py-2 bg-gray-100 rounded-lg">
              📍 <strong>{result.geocoded}</strong>/{result.total} geocodade
            </div>
            <div className="px-3 py-2 bg-gray-100 rounded-lg">
              📏 Max: <strong>{result.stats.max_km} km</strong>
            </div>
            <div className="px-3 py-2 bg-gray-100 rounded-lg">
              📐 Min: <strong>{result.stats.min_km} km</strong>
            </div>
            <div className="px-3 py-2 bg-gray-100 rounded-lg">
              📊 Snitt: <strong>{result.stats.avg_km} km</strong>
            </div>
          </div>
          
          {result.distance_source === 'haversine' && (
            <div className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded-lg">
              💡 Avstånden beräknas som fågelvägen. Cykelvägsavstånd aktiveras snart!
            </div>
          )}
          
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-medium text-red-800 mb-3">
                🚨 {result.warnings.length} par med &gt;2 km avstånd
              </h3>
              <div className="space-y-2">
                {result.warnings.slice(0, 5).map((w, i) => (
                  <div key={i} className="flex justify-between items-center bg-white p-3 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{w.from_name}</div>
                      <div className="text-xs text-gray-400">{w.from_address}</div>
                    </div>
                    <div className="px-3 text-gray-400">↔</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{w.to_name}</div>
                      <div className="text-xs text-gray-400">{w.to_address}</div>
                    </div>
                    <div className="text-red-600 font-bold ml-4">
                      {w.distance_km} km
                    </div>
                  </div>
                ))}
                {result.warnings.length > 5 && (
                  <div className="text-sm text-red-600 text-center">
                    ... och {result.warnings.length - 5} fler
                  </div>
                )}
              </div>
            </div>
          )}
          
          {result.warnings.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <span className="text-green-700">✅ Alla värdar är inom 2 km från varandra!</span>
            </div>
          )}
          
          {/* Not geocoded */}
          {result.not_geocoded.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-medium text-yellow-800 mb-2">
                ⚠️ {result.not_geocoded.length} adress{result.not_geocoded.length > 1 ? 'er' : ''} kunde inte hittas
              </h3>
              <div className="space-y-1 text-sm text-yellow-700">
                {result.not_geocoded.map(n => (
                  <div key={n.id}>{n.name}: {n.address}</div>
                ))}
              </div>
            </div>
          )}
          
          {/* Toggle all distances */}
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-amber-600 hover:text-amber-700"
          >
            {showAll ? '▲ Dölj avståndstabell' : '▼ Visa alla avstånd mellan värdar'}
          </button>
          
          {showAll && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Värd 1</th>
                    <th className="px-4 py-2 text-left">Värd 2</th>
                    <th className="px-4 py-2 text-right">Avstånd</th>
                    {result.distance_source === 'cycling' && (
                      <th className="px-4 py-2 text-right">Cykeltid</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.pairwise_distances.map((d, i) => (
                    <tr 
                      key={i}
                      className={d.distance_km > 5 ? 'bg-red-50' : ''}
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium">{d.from_name}</div>
                        <div className="text-xs text-gray-400">{d.from_address}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{d.to_name}</div>
                        <div className="text-xs text-gray-400">{d.to_address}</div>
                      </td>
                      <td className={`px-4 py-2 text-right font-bold ${
                        d.distance_km > 5 ? 'text-red-600' : 
                        d.distance_km > 3 ? 'text-amber-600' : 'text-green-600'
                      }`}>
                        {d.distance_km} km
                      </td>
                      {result.distance_source === 'cycling' && (
                        <td className="px-4 py-2 text-right text-gray-600">
                          {d.duration_min} min
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {!result && !checking && (
        <p className="text-sm text-gray-500">
          Klicka för att kontrollera avstånd mellan alla värdar. Visar tabell sorterad från längst till kortast avstånd.
        </p>
      )}
    </div>
  );
}
