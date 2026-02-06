'use client';

/**
 * EnvelopeContainer - Fetches and displays all envelopes for a participant
 * 
 * Features:
 * - Auto-polling for state updates
 * - Server time synchronization
 * - Smooth transitions between states
 */

import { useState, useEffect, useCallback } from 'react';
import { LiveEnvelope } from './LiveEnvelope';
import type { EnvelopeStatusResponse, CourseEnvelopeStatus } from '@/types/database';

interface EnvelopeContainerProps {
  eventId: string;
  coupleId: string;
  pollInterval?: number; // ms, default 30s
}

export function EnvelopeContainer({ 
  eventId, 
  coupleId, 
  pollInterval = 30000 
}: EnvelopeContainerProps) {
  const [data, setData] = useState<EnvelopeStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch envelope status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/envelope/status?eventId=${eventId}&coupleId=${coupleId}`
      );
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Kunde inte hämta kuvert');
      }
      
      const newData: EnvelopeStatusResponse = await res.json();
      setData(newData);
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Något gick fel');
    } finally {
      setLoading(false);
    }
  }, [eventId, coupleId]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling
  useEffect(() => {
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStatus, pollInterval]);

  // Calculate next important event for adaptive polling
  const getNextEventSeconds = (): number | null => {
    if (!data) return null;
    
    const nextReveals = data.courses
      .map(c => c.next_reveal?.in_seconds)
      .filter((s): s is number => s !== null && s !== undefined);
    
    if (nextReveals.length === 0) return null;
    return Math.min(...nextReveals);
  };

  // Adaptive poll: faster when close to reveal
  useEffect(() => {
    const nextSeconds = getNextEventSeconds();
    if (nextSeconds === null) return;
    
    // If next reveal is within 2 minutes, poll faster
    if (nextSeconds <= 120 && nextSeconds > 0) {
      const fastPoll = setInterval(fetchStatus, 10000); // 10s
      return () => clearInterval(fastPoll);
    }
  }, [data, fetchStatus]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-24 bg-gray-100 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
        <p className="text-red-700">❌ {error}</p>
        <button
          onClick={fetchStatus}
          className="mt-2 text-sm text-red-600 underline hover:no-underline"
        >
          Försök igen
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Envelopes */}
      {data.courses.map((course) => (
        <LiveEnvelope
          key={course.type}
          course={course}
        />
      ))}

      {/* Afterparty */}
      {data.afterparty.state === 'OPEN' && data.afterparty.location && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🎉</span>
            <h3 className="font-semibold text-purple-800">Efterfest</h3>
          </div>
          <p className="text-purple-700">{data.afterparty.location}</p>
          {data.afterparty.description && (
            <p className="text-sm text-purple-600 mt-1">{data.afterparty.description}</p>
          )}
        </div>
      )}

      {/* Debug/status info */}
      <div className="text-xs text-gray-400 text-center pt-4">
        Senast uppdaterad: {lastUpdate?.toLocaleTimeString('sv-SE')}
        <br />
        Servertid: {new Date(data.server_time).toLocaleTimeString('sv-SE')}
      </div>
    </div>
  );
}

export default EnvelopeContainer;
