'use client';

/**
 * EnvelopeContainer - Fetches and displays all envelopes for a participant
 * 
 * Features:
 * - Auto-polling for state updates
 * - Server time synchronization
 * - Smooth transitions between states
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { LiveEnvelope } from './LiveEnvelope';
import { AfterpartyCard } from './AfterpartyCard';
import { createClient } from '@/lib/supabase/client';
import type { EnvelopeStatusResponse, CourseEnvelopeStatus } from '@/types/database';

interface EnvelopeContainerProps {
  eventId: string;
  coupleId: string;
  pollInterval?: number; // ms, default 30s
  simulateTime?: string; // ISO datetime for organizer preview
}

export function EnvelopeContainer({ 
  eventId, 
  coupleId, 
  pollInterval = 30000,
  simulateTime,
}: EnvelopeContainerProps) {
  const [data, setData] = useState<EnvelopeStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // Fetch envelope status
  const fetchStatus = useCallback(async () => {
    if (!eventId || !coupleId) return;
    try {
      const timeParam = simulateTime ? `&simulateTime=${encodeURIComponent(simulateTime)}` : '';
      const res = await fetch(
        `/api/envelope/status?eventId=${eventId}&coupleId=${coupleId}${timeParam}`
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
  }, [eventId, coupleId, simulateTime]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Realtime updates (skip in preview mode)
  useEffect(() => {
    if (!eventId || !coupleId || simulateTime) return;

    const channel = supabase
      .channel(`envelope-updates-${coupleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'envelopes',
          filter: `couple_id=eq.${coupleId}`,
        },
        () => {
          fetchStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, coupleId, simulateTime, supabase, fetchStatus]);

  // Polling fallback (skip if pollInterval is 0 or falsy)
  useEffect(() => {
    if (!pollInterval) return;
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStatus, pollInterval]);

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
          isPreview={!!simulateTime}
        />
      ))}

      {/* Afterparty card — 4th card */}
      {data.afterparty && (
        <AfterpartyCard
          afterparty={data.afterparty}
          isPreview={!!simulateTime}
        />
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
