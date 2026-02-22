'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SubPageHeader } from '@/components/organizer/SubPageHeader';

type Preference = 'avoid' | 'low' | 'neutral' | 'preferred' | 'known';

interface CoupleCard {
  id: string;
  invited_name: string;
  partner_name: string | null;
  address: string | null;
  address_unit: string | null;
  allergies: string[];
  pet_allergy: boolean;
  distance: number | null;
  duration_min: number | null;
  distance_source: string | null;
  preference: Preference;
}

interface SourceCouple {
  id: string;
  invited_name: string;
  partner_name: string | null;
}

const PREF_CONFIG: Record<Preference, { label: string; shortLabel: string; emoji: string; color: string; border: string; bg: string }> = {
  avoid:     { label: 'Ej mötas',       shortLabel: 'Undvik',      emoji: '⛔', color: 'text-red-700',    border: 'border-red-400 ring-2 ring-red-200',    bg: 'bg-red-50' },
  low:       { label: 'Låg prio',       shortLabel: 'Låg prio',   emoji: '👎', color: 'text-orange-700', border: 'border-orange-300 ring-2 ring-orange-100', bg: 'bg-orange-50' },
  neutral:   { label: 'Spelar ingen roll', shortLabel: 'Neutral', emoji: '🤷', color: 'text-gray-500', border: 'border-gray-200', bg: 'bg-white' },
  preferred: { label: 'Prioriterat',    shortLabel: 'Prio',       emoji: '👍', color: 'text-green-700',  border: 'border-green-400 ring-2 ring-green-200',  bg: 'bg-green-50' },
  known:     { label: 'Träffats förut', shortLabel: 'Träffats',   emoji: '🔄', color: 'text-blue-700',   border: 'border-blue-400 ring-2 ring-blue-200',   bg: 'bg-blue-50' },
};

const PREF_ORDER: Preference[] = ['avoid', 'low', 'neutral', 'preferred', 'known'];

export default function PreferencesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const coupleId = params.coupleId as string;

  const [couples, setCouples] = useState<CoupleCard[]>([]);
  const [source, setSource] = useState<SourceCouple | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<Preference | 'all'>('all');
  const [swipeIdx, setSwipeIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/preferences?coupleId=${coupleId}`)
      .then(r => r.json())
      .then(data => {
        setCouples(data.couples || []);
        setSource(data.sourceCouple);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId, coupleId]);

  const setPref = useCallback(async (targetId: string, pref: Preference) => {
    setSaving(targetId);
    setCouples(prev => prev.map(c => c.id === targetId ? { ...c, preference: pref } : c));

    await fetch(`/api/organizer/events/${eventId}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coupleId, targetCoupleId: targetId, preference: pref }),
    });
    setSaving(null);
  }, [eventId, coupleId]);

  const filtered = filter === 'all' ? couples : couples.filter(c => c.preference === filter);
  
  const stats = {
    avoid: couples.filter(c => c.preference === 'avoid').length,
    low: couples.filter(c => c.preference === 'low').length,
    neutral: couples.filter(c => c.preference === 'neutral').length,
    preferred: couples.filter(c => c.preference === 'preferred').length,
    known: couples.filter(c => c.preference === 'known').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const sourceName = source
    ? `${source.invited_name}${source.partner_name ? ` & ${source.partner_name}` : ''}`
    : '...';

  return (
    <div className="min-h-screen bg-gray-50">
      <SubPageHeader eventId={eventId} title="🎯 Matchningspreferenser" parentView="matching" />

      {/* Stats bar */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto">
          <FilterChip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label={`Alla (${couples.length})`}
          />
          {PREF_ORDER.map(p => (
            <FilterChip
              key={p}
              active={filter === p}
              onClick={() => setFilter(p)}
              label={`${PREF_CONFIG[p].emoji} ${stats[p]}`}
            />
          ))}
        </div>
      </div>

      {/* Cards */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">🔍</div>
            <p>Inga par med denna preferens</p>
          </div>
        ) : (
          filtered.map((couple, idx) => (
            <SwipeableCard
              key={couple.id}
              couple={couple}
              onSetPref={setPref}
              isSaving={saving === couple.id}
            />
          ))
        )}
      </main>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function SwipeableCard({
  couple,
  onSetPref,
  isSaving,
}: {
  couple: CoupleCard;
  onSetPref: (id: string, pref: Preference) => void;
  isSaving: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);

  const cfg = PREF_CONFIG[couple.preference];
  const displayName = couple.partner_name
    ? `${couple.invited_name} & ${couple.partner_name}`
    : couple.invited_name;

  // Swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    setIsDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    
    // Determine direction on first significant move
    if (isHorizontal.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }
    
    if (isHorizontal.current) {
      e.preventDefault();
      setDragX(dx);
    }
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(dragX) > 80) {
      // Swipe right = preferred, left = avoid
      const newPref: Preference = dragX > 0 ? 'preferred' : 'avoid';
      onSetPref(couple.id, newPref);
    }
    setDragX(0);
    isHorizontal.current = null;
  };

  // Swipe hint overlay
  const swipeHint = isDragging && Math.abs(dragX) > 30 ? (
    <div className={`absolute inset-0 rounded-xl flex items-center justify-center text-2xl font-bold z-10 transition-opacity ${
      dragX > 0 ? 'bg-green-100/80 text-green-700' : 'bg-red-100/80 text-red-700'
    }`}>
      {dragX > 0 ? '👍 Prioriterat' : '⛔ Ej mötas'}
    </div>
  ) : null;

  return (
    <div
      ref={cardRef}
      className={`relative rounded-xl p-4 shadow-sm border-2 transition-all ${cfg.border} ${cfg.bg} ${
        isSaving ? 'opacity-70' : ''
      }`}
      style={{
        transform: isDragging ? `translateX(${dragX}px) rotate(${dragX * 0.05}deg)` : undefined,
        transition: isDragging ? 'none' : 'transform 0.3s ease',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {swipeHint}

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900 text-base">{displayName}</h3>
          {couple.address && (
            <p className="text-sm text-gray-500 mt-0.5">
              📍 {couple.address}{couple.address_unit ? `, ${couple.address_unit}` : ''}
            </p>
          )}
        </div>
        {couple.distance !== null && (
          <span className="shrink-0 ml-3 bg-gray-100 text-gray-700 text-xs font-medium px-2 py-1 rounded-full">
            🚴 {couple.distance < 1 ? `${Math.round(couple.distance * 1000)}m` : `${couple.distance.toFixed(1)} km`}
            {couple.duration_min ? ` · ${couple.duration_min} min` : ''}
          </span>
        )}
      </div>

      {/* Tags */}
      {(couple.allergies.length > 0 || couple.pet_allergy) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {couple.allergies.map((a, i) => (
            <span key={i} className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
              ⚠️ {a}
            </span>
          ))}
          {couple.pet_allergy && (
            <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">
              🐾 Djurallergi
            </span>
          )}
        </div>
      )}

      {/* Current preference badge */}
      <div className={`text-xs font-medium ${cfg.color} mb-3`}>
        {cfg.emoji} {cfg.label}
      </div>

      {/* Preference buttons */}
      <div className="flex gap-1.5">
        {PREF_ORDER.map(p => {
          const pc = PREF_CONFIG[p];
          const isActive = couple.preference === p;
          return (
            <button
              key={p}
              onClick={() => onSetPref(couple.id, p)}
              disabled={isSaving}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? `${pc.bg} ${pc.color} border-2 ${pc.border} scale-105`
                  : 'bg-gray-50 text-gray-400 border border-gray-200 hover:bg-gray-100'
              }`}
              title={pc.label}
            >
              <span className="block text-base">{pc.emoji}</span>
              <span className="block mt-0.5 leading-tight">{pc.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
