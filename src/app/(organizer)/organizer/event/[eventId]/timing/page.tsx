'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

function InfoTooltip({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={tooltipRef}>
      <button type="button" onClick={() => setIsOpen(!isOpen)}
        className="ml-2 w-5 h-5 rounded-full border-2 border-indigo-400 text-indigo-500 text-xs font-bold hover:bg-indigo-100 transition-colors inline-flex items-center justify-center flex-shrink-0"
        aria-label="Mer information">?</button>
      {isOpen && (
        <div className="fixed inset-x-4 top-1/3 z-50 p-4 bg-gray-100 text-gray-800 text-sm rounded-xl shadow-xl border border-gray-200 md:absolute md:inset-auto md:left-0 md:top-8 md:w-72">
          {text}
          <button type="button" onClick={() => setIsOpen(false)} className="mt-3 w-full py-2 bg-indigo-500 text-white rounded-lg font-medium md:hidden">Stäng</button>
        </div>
      )}
      {isOpen && <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setIsOpen(false)} />}
    </div>
  );
}

interface TimingSettings {
  id: string;
  event_id: string;
  teasing_minutes_before: number;
  clue_1_minutes_before: number;
  clue_2_minutes_before: number;
  street_minutes_before: number;
  number_minutes_before: number;
  during_meal_clue_interval_minutes: number;
  distance_adjustment_enabled: boolean;
}

export default function TimingEditorPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [timing, setTiming] = useState<TimingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/timing`);
      const data = await res.json();
      if (res.ok) {
        setTiming(data.timing);
        setEventName(data.eventName);
      } else {
        setError(data.error || 'Kunde inte ladda');
      }
    } catch { setError('Nätverksfel'); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!timing) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/timing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teasing_minutes_before: timing.teasing_minutes_before,
          clue_1_minutes_before: timing.clue_1_minutes_before,
          clue_2_minutes_before: timing.clue_2_minutes_before,
          street_minutes_before: timing.street_minutes_before,
          number_minutes_before: timing.number_minutes_before,
          during_meal_clue_interval_minutes: timing.during_meal_clue_interval_minutes,
          distance_adjustment_enabled: timing.distance_adjustment_enabled,
        }),
      });
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
      else { const d = await res.json(); setError(d.error || 'Kunde inte spara'); }
    } catch { setError('Nätverksfel'); }
    finally { setSaving(false); }
  }

  function handleChange(field: keyof TimingSettings, value: number | boolean) {
    if (!timing) return;
    setTiming({ ...timing, [field]: value });
  }

  if (loading) return <div className="min-h-screen bg-gray-50 p-8"><div className="max-w-2xl mx-auto animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/3"></div><div className="h-64 bg-gray-200 rounded"></div></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href={`/organizer/event/${eventId}/settings`} className="text-indigo-600 hover:text-indigo-700 text-sm mb-2 inline-block">← Inställningar</Link>
          <h1 className="text-2xl font-bold text-gray-900">⏱️ Timing-inställningar</h1>
          <p className="text-gray-600">{eventName}</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>}
        {saved && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">✅ Sparat!</div>}

        {timing && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center flex-wrap">
                📬 Kuvert-reveals (innan rätt startar)
                <InfoTooltip text="Tiderna anger hur långt innan varje rätt startar som respektive reveal sker." />
              </h2>
              <div className="space-y-4">
                <TimingRow label="🤫 Nyfiken? (teasing)" value={timing.teasing_minutes_before} onChange={(v) => handleChange('teasing_minutes_before', v)} options={[180,240,300,360,420,480]} />
                <TimingRow label="🔮 Ledtråd 1" value={timing.clue_1_minutes_before} onChange={(v) => handleChange('clue_1_minutes_before', v)} options={[60,90,120,150,180]} />
                <TimingRow label="🔮 Ledtråd 2" value={timing.clue_2_minutes_before} onChange={(v) => handleChange('clue_2_minutes_before', v)} options={[15,20,30,45,60]} />
                <TimingRow label="📍 Gatunamn" value={timing.street_minutes_before} onChange={(v) => handleChange('street_minutes_before', v)} options={[10,15,20,25,30]} />
                <TimingRow label="🔢 Husnummer" value={timing.number_minutes_before} onChange={(v) => handleChange('number_minutes_before', v)} options={[3,5,8,10,15]} />
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center flex-wrap">
                🍽️ Under måltiden
                <InfoTooltip text="Max antal ledtrådar om nästa värd som visas medan gästerna äter." />
              </h2>
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-700">Max ledtrådar per måltid</span>
                <select value={timing.during_meal_clue_interval_minutes} onChange={(e) => handleChange('during_meal_clue_interval_minutes', parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-200 rounded-lg">
                  {[1,2,3,4].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center flex-wrap">
                🚴 Avståndsanpassning
                <InfoTooltip text="Par med längre cykelavstånd får tidigare reveals." />
              </h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={timing.distance_adjustment_enabled} onChange={(e) => handleChange('distance_adjustment_enabled', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-500" />
                <div>
                  <span className="text-gray-800 font-medium">Auto-justera för cykelavstånd</span>
                  <p className="text-gray-500 text-sm">Längre avstånd → tidigare gatunamn/nummer</p>
                </div>
              </label>
            </div>

            {/* Timeline preview */}
            <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-200">
              <h2 className="text-lg font-semibold text-indigo-800 mb-4">📅 Förhandsvisning</h2>
              <p className="text-indigo-700 text-sm mb-3 font-medium">Innan förrätt (18:00):</p>
              <div className="space-y-2 text-sm">
                <TimelineItem time={fmtTime(18*60 - timing.teasing_minutes_before)} label="Nyfiken? 🤫" />
                <TimelineItem time={fmtTime(18*60 - timing.clue_1_minutes_before)} label="Ledtråd 1" />
                <TimelineItem time={fmtTime(18*60 - timing.clue_2_minutes_before)} label="Ledtråd 2" />
                <TimelineItem time={fmtTime(18*60 - timing.street_minutes_before)} label="Gatunamn" />
                <TimelineItem time={fmtTime(18*60 - timing.number_minutes_before)} label="Husnummer" />
                <TimelineItem time="18:00" label="🎉 Full reveal!" highlight />
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors">
              {saving ? 'Sparar...' : '💾 Spara inställningar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TimingRow({ label, value, onChange, options }: { label: string; value: number; onChange: (v: number) => void; options: number[] }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-700">{label}</span>
      <select value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="px-3 py-2 border border-gray-200 rounded-lg">
        {options.map(opt => <option key={opt} value={opt}>{opt < 60 ? `${opt} min` : `${Math.floor(opt/60)}h${opt%60 ? ` ${opt%60}m` : ''}`}</option>)}
      </select>
    </div>
  );
}

function TimelineItem({ time, label, highlight = false }: { time: string; label: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${highlight ? 'font-semibold text-indigo-800' : 'text-indigo-700'}`}>
      <span className="font-mono w-14">{time}</span>
      <span className="flex-1 border-t border-indigo-200 border-dashed"></span>
      <span>{label}</span>
    </div>
  );
}

function fmtTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}
