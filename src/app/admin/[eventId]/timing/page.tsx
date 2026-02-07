'use client';

/**
 * Admin Timing Editor
 * 
 * Allows event organizers to configure when envelope reveals happen.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

// Info tooltip component
function InfoTooltip({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  return (
    <div className="relative inline-block" ref={tooltipRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="ml-2 w-5 h-5 rounded-full border-2 border-amber-400 text-amber-500 text-xs font-bold hover:bg-amber-100 transition-colors inline-flex items-center justify-center"
        aria-label="Mer information"
      >
        ?
      </button>
      {isOpen && (
        <div className="absolute z-50 left-0 top-7 w-64 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg">
          <div className="absolute -top-1.5 left-2 w-3 h-3 bg-gray-800 rotate-45"></div>
          {text}
        </div>
      )}
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

const DEFAULT_TIMING: Omit<TimingSettings, 'id' | 'event_id'> = {
  teasing_minutes_before: 360,
  clue_1_minutes_before: 120,
  clue_2_minutes_before: 30,
  street_minutes_before: 15,
  number_minutes_before: 5,
  during_meal_clue_interval_minutes: 15,
  distance_adjustment_enabled: true,
};

export default function TimingEditorPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  
  const [timing, setTiming] = useState<TimingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string>('');
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
  }, [eventId]);
  
  async function loadData() {
    setLoading(true);
    
    // Get event name
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single();
    
    if (event) setEventName(event.name);
    
    // Get timing settings
    const { data: timingData, error: timingError } = await supabase
      .from('event_timing')
      .select('*')
      .eq('event_id', eventId)
      .single();
    
    if (timingError && timingError.code !== 'PGRST116') {
      setError(timingError.message);
    } else if (timingData) {
      setTiming(timingData);
    } else {
      // No timing exists, create default
      const { data: newTiming, error: createError } = await supabase
        .from('event_timing')
        .insert({ event_id: eventId, ...DEFAULT_TIMING })
        .select()
        .single();
      
      if (createError) {
        setError(createError.message);
      } else {
        setTiming(newTiming);
      }
    }
    
    setLoading(false);
  }
  
  async function handleSave() {
    if (!timing) return;
    
    setSaving(true);
    setSaved(false);
    setError(null);
    
    const { error: updateError } = await supabase
      .from('event_timing')
      .update({
        teasing_minutes_before: timing.teasing_minutes_before,
        clue_1_minutes_before: timing.clue_1_minutes_before,
        clue_2_minutes_before: timing.clue_2_minutes_before,
        street_minutes_before: timing.street_minutes_before,
        number_minutes_before: timing.number_minutes_before,
        during_meal_clue_interval_minutes: timing.during_meal_clue_interval_minutes,
        distance_adjustment_enabled: timing.distance_adjustment_enabled,
      })
      .eq('id', timing.id);
    
    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    
    setSaving(false);
  }
  
  function handleChange(field: keyof TimingSettings, value: number | boolean) {
    if (!timing) return;
    setTiming({ ...timing, [field]: value });
  }
  
  function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link 
            href={`/admin/${eventId}`}
            className="text-amber-600 hover:text-amber-700 text-sm mb-2 inline-block"
          >
            ← Tillbaka till admin
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            ⏱️ Timing-inställningar
          </h1>
          <p className="text-gray-600">{eventName}</p>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            ✅ Sparat!
          </div>
        )}
        
        {timing && (
          <div className="space-y-6">
            {/* Reveal timing */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center flex-wrap">
                📬 Kuvert-reveals (innan rätt startar)
                <InfoTooltip text="Tiderna anger hur långt innan varje rätt startar som respektive reveal sker. T.ex. '6h' för teasing = gästerna ser 'Nyfiken?' 6 timmar innan förrätten." />
              </h2>
              
              <div className="space-y-4">
                <TimingRow
                  label="🤫 Nyfiken? (teasing)"
                  value={timing.teasing_minutes_before}
                  onChange={(v) => handleChange('teasing_minutes_before', v)}
                  options={[180, 240, 300, 360, 420, 480]}
                />
                
                <TimingRow
                  label="🔮 Ledtråd 1"
                  value={timing.clue_1_minutes_before}
                  onChange={(v) => handleChange('clue_1_minutes_before', v)}
                  options={[60, 90, 120, 150, 180]}
                />
                
                <TimingRow
                  label="🔮 Ledtråd 2"
                  value={timing.clue_2_minutes_before}
                  onChange={(v) => handleChange('clue_2_minutes_before', v)}
                  options={[15, 20, 30, 45, 60]}
                />
                
                <TimingRow
                  label="📍 Gatunamn"
                  value={timing.street_minutes_before}
                  onChange={(v) => handleChange('street_minutes_before', v)}
                  options={[10, 15, 20, 25, 30]}
                />
                
                <TimingRow
                  label="🔢 Husnummer"
                  value={timing.number_minutes_before}
                  onChange={(v) => handleChange('number_minutes_before', v)}
                  options={[3, 5, 8, 10, 15]}
                />
              </div>
            </div>
            
            {/* During meal */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center flex-wrap">
                🍽️ Under måltiden
                <InfoTooltip text="Medan gästerna äter hos värden kan de få extra ledtrådar om nästa destination. Detta intervall styr hur ofta nya ledtrådar visas under måltiden." />
              </h2>
              
              <TimingRow
                label="Ny ledtråd var"
                value={timing.during_meal_clue_interval_minutes}
                onChange={(v) => handleChange('during_meal_clue_interval_minutes', v)}
                options={[10, 15, 20, 30]}
                suffix="min"
              />
            </div>
            
            {/* Distance adjustment */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center flex-wrap">
                🚴 Avståndsanpassning
                <InfoTooltip text="Par med längre cykelavstånd till sin destination får tidigare reveals (gatunamn och husnummer) så de hinner cykla dit i tid. Systemet beräknar avstånd automatiskt." />
              </h2>
              
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={timing.distance_adjustment_enabled}
                  onChange={(e) => handleChange('distance_adjustment_enabled', e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <span className="text-gray-800 font-medium">
                    Auto-justera för cykelavstånd
                  </span>
                  <p className="text-gray-500 text-sm">
                    Längre avstånd → tidigare gatunamn/nummer
                  </p>
                </div>
              </label>
            </div>
            
            {/* Timeline preview */}
            <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
              <h2 className="text-lg font-semibold text-amber-800 mb-4">
                📅 Förhandsvisning (exempel: Förrätt 18:00)
              </h2>
              
              <div className="space-y-2 text-sm">
                <TimelineItem time={`${formatTimeFromMinutes(18*60 - timing.teasing_minutes_before)}`} label="Nyfiken? 🤫" />
                <TimelineItem time={`${formatTimeFromMinutes(18*60 - timing.clue_1_minutes_before)}`} label="Ledtråd 1" />
                <TimelineItem time={`${formatTimeFromMinutes(18*60 - timing.clue_2_minutes_before)}`} label="Ledtråd 2" />
                <TimelineItem time={`${formatTimeFromMinutes(18*60 - timing.street_minutes_before)}`} label="Gatunamn" />
                <TimelineItem time={`${formatTimeFromMinutes(18*60 - timing.number_minutes_before)}`} label="Husnummer" />
                <TimelineItem time="18:00" label="🎉 Full reveal!" highlight />
              </div>
            </div>
            
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              {saving ? 'Sparar...' : '💾 Spara inställningar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper components

function TimingRow({ 
  label, 
  value, 
  onChange, 
  options,
  suffix = ''
}: { 
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: number[];
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {formatMinutesShort(opt)}{suffix && ` ${suffix}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function TimelineItem({ time, label, highlight = false }: { time: string; label: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${highlight ? 'font-semibold text-amber-800' : 'text-amber-700'}`}>
      <span className="font-mono w-14">{time}</span>
      <span className="flex-1 border-t border-amber-200 border-dashed"></span>
      <span>{label}</span>
    </div>
  );
}

function formatMinutesShort(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTimeFromMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
