'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';
import { EnvelopeContainer } from '@/components/envelope';

interface CoupleOption {
  id: string;
  invited_name: string;
  partner_name: string | null;
}

interface RevealTime {
  label: string;
  time: string; // ISO datetime
  display: string; // HH:MM
  state: string;
}

export default function HelpGuestPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [couples, setCouples] = useState<CoupleOption[]>([]);
  const [selectedCouple, setSelectedCouple] = useState<string>('');
  const [revealTimes, setRevealTimes] = useState<RevealTime[]>([]);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [eventDate, setEventDate] = useState<string>('');
  const timelineRef = useRef<HTMLDivElement>(null);

  // Load couples
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/organizer/events/${eventId}/couples`);
        const data = await res.json();
        if (res.ok) {
          const sorted = (data.couples || [])
            .filter((c: any) => !c.cancelled)
            .sort((a: CoupleOption, b: CoupleOption) => a.invited_name.localeCompare(b.invited_name, 'sv'));
          setCouples(sorted);
        }

        const evtRes = await fetch(`/api/organizer/events/${eventId}/settings`);
        const evtData = await evtRes.json();
        if (evtRes.ok) {
          setEventDate(evtData.event?.event_date || '');
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, [eventId]);

  // Load reveal times when couple selected
  useEffect(() => {
    if (!selectedCouple || !eventDate) {
      setRevealTimes([]);
      return;
    }

    async function loadTimes() {
      try {
        // Fetch envelope data for this couple to get reveal times
        const res = await fetch(`/api/organizer/events/${eventId}/envelope-times?coupleId=${selectedCouple}`);
        const data = await res.json();
        if (res.ok && data.times) {
          setRevealTimes(data.times);
          // Auto-select "now" or first time
          const now = new Date().toISOString();
          const closest = data.times.reduce((prev: RevealTime, curr: RevealTime) =>
            Math.abs(new Date(curr.time).getTime() - Date.now()) < Math.abs(new Date(prev.time).getTime() - Date.now())
              ? curr : prev
          , data.times[0]);
          setSelectedTime(closest?.time || data.times[0]?.time || '');
        }
      } catch { /* ignore */ }
    }
    loadTimes();
  }, [selectedCouple, eventId, eventDate]);

  function scrollTimeline(dir: number) {
    if (timelineRef.current) {
      timelineRef.current.scrollBy({ left: dir * 150, behavior: 'smooth' });
    }
  }

  const selectedCoupleName = couples.find(c => c.id === selectedCouple);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <SubPageHeader eventId={eventId} title="🔍 Hjälp ett par" parentView="live" />
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-400">Laddar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SubPageHeader eventId={eventId} title="🔍 Hjälp ett par" parentView="live" />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Couple picker */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Välj par</label>
          <select
            value={selectedCouple}
            onChange={e => setSelectedCouple(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">— Välj ett par —</option>
            {couples.map(c => (
              <option key={c.id} value={c.id}>
                {c.invited_name}{c.partner_name ? ` & ${c.partner_name}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Timeline */}
        {selectedCouple && revealTimes.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Tidslinje — {revealTimes.length} avslöjanden
            </label>
            <div className="relative flex items-center gap-1">
              {/* Left arrow */}
              <button
                onClick={() => scrollTimeline(-1)}
                className="shrink-0 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm"
              >
                ‹
              </button>

              {/* Scrollable timeline */}
              <div
                ref={timelineRef}
                className="flex-1 overflow-x-auto flex gap-2 py-2 scrollbar-hide overscroll-x-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {revealTimes.map((rt) => {
                  const isSelected = selectedTime === rt.time;
                  const isPast = new Date(rt.time) <= new Date();
                  return (
                    <button
                      key={rt.time}
                      onClick={() => setSelectedTime(rt.time)}
                      className={`shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium transition border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                          : isPast
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-[10px] opacity-75">{rt.label}</span>
                      <span className="font-bold">{rt.display}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right arrow */}
              <button
                onClick={() => scrollTimeline(1)}
                className="shrink-0 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm"
              >
                ›
              </button>
            </div>
          </div>
        )}

        {/* Envelope preview */}
        {selectedCouple && selectedTime && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">
                📨 Kuvert — {selectedCoupleName?.invited_name}
                {selectedCoupleName?.partner_name && ` & ${selectedCoupleName.partner_name}`}
              </div>
              <div className="text-xs text-gray-400">
                {new Date(selectedTime).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="p-4">
              <EnvelopeContainer
                key={`${selectedCouple}-${selectedTime}`}
                eventId={eventId}
                coupleId={selectedCouple}
                simulateTime={selectedTime}
                pollInterval={0}
              />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedCouple && (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">🔍</div>
            <p className="text-gray-500">Välj ett par ovan för att se deras kuvert</p>
            <p className="text-xs text-gray-400 mt-1">Du kan välja vilken tid som helst för att se vad de ser just då</p>
          </div>
        )}

        {selectedCouple && revealTimes.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">Inga kuverttider hittades för detta par</p>
            <p className="text-xs text-gray-400 mt-1">Har matchningen körts och kuverttider beräknats?</p>
          </div>
        )}
      </main>
    </div>
  );
}
