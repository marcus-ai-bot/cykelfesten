'use client';

import { useState } from 'react';

interface DistanceWarning {
  id: string;
  name: string;
  address: string;
  distance_km: number;
}

interface DistanceCheckResult {
  warnings: DistanceWarning[];
  all_distances: DistanceWarning[];
  median_distance_km: number;
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
          {/* Summary */}
          <div className="flex gap-4 text-sm">
            <div className="px-3 py-1 bg-gray-100 rounded-lg">
              📍 {result.geocoded}/{result.total} geocodade
            </div>
            <div className="px-3 py-1 bg-gray-100 rounded-lg">
              📏 Median: {result.median_distance_km} km
            </div>
          </div>
          
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-medium text-red-800 mb-3">
                🚨 {result.warnings.length} adress{result.warnings.length > 1 ? 'er' : ''} för långt bort (&gt;5 km)
              </h3>
              <div className="space-y-2">
                {result.warnings.map(w => (
                  <div key={w.id} className="flex justify-between items-center bg-white p-3 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{w.name}</div>
                      <div className="text-sm text-gray-500">{w.address}</div>
                    </div>
                    <div className="text-red-600 font-bold">
                      {w.distance_km} km
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {result.warnings.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <span className="text-green-700">✅ Alla adresser är inom 5 km från centrum!</span>
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
            {showAll ? '▲ Dölj alla avstånd' : '▼ Visa alla avstånd'}
          </button>
          
          {showAll && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Namn</th>
                    <th className="px-4 py-2 text-left">Adress</th>
                    <th className="px-4 py-2 text-right">Avstånd</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.all_distances.map(d => (
                    <tr 
                      key={d.id}
                      className={d.distance_km > 5 ? 'bg-red-50' : ''}
                    >
                      <td className="px-4 py-2">{d.name}</td>
                      <td className="px-4 py-2 text-gray-500">{d.address}</td>
                      <td className={`px-4 py-2 text-right font-medium ${
                        d.distance_km > 5 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {d.distance_km} km
                      </td>
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
          Klicka för att kontrollera att alla adresser är inom rimligt cykelavstånd.
        </p>
      )}
    </div>
  );
}
