'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  address: string | null;
  coordinates: unknown;
  invited_email: string | null;
  partner_email: string | null;
  invited_allergies: string[] | null;
  partner_allergies: string[] | null;
  invited_allergy_notes: string | null;
  partner_allergy_notes: string | null;
  role: string | null;
  confirmed: boolean;
  is_reserve: boolean;
  role_preference: string;
  cancelled: boolean;
  created_at: string;
}

type Filter = 'alla' | 'vantar' | 'bekraftade' | 'inkompletta' | 'saknar_adress' | 'reserver' | 'guest_only';

interface Props {
  eventId: string;
}

export function InlineGuestList({ eventId }: Props) {
  const [couples, setCouples] = useState<Couple[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('alla');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/couples`)
      .then(r => r.json())
      .then(data => {
        setCouples(data.couples || data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId]);

  const active = useMemo(() => couples.filter(c => !c.cancelled), [couples]);

  const filtered = useMemo(() => {
    let list = active;

    // Filter
    switch (filter) {
      case 'vantar': list = list.filter(c => !c.confirmed && !c.is_reserve); break;
      case 'bekraftade': list = list.filter(c => c.confirmed); break;
      case 'inkompletta': list = list.filter(c => !c.address || !c.invited_email); break;
      case 'saknar_adress': list = list.filter(c => !c.coordinates); break;
      case 'reserver': list = list.filter(c => c.is_reserve); break;
      case 'guest_only': list = list.filter(c => c.role_preference === 'guest_only'); break;
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.invited_name?.toLowerCase().includes(q) ||
        c.partner_name?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [active, filter, search]);

  const counts = useMemo(() => ({
    alla: active.length,
    vantar: active.filter(c => !c.confirmed && !c.is_reserve).length,
    bekraftade: active.filter(c => c.confirmed).length,
    inkompletta: active.filter(c => !c.address || !c.invited_email).length,
    saknar_adress: active.filter(c => !c.coordinates).length,
    reserver: active.filter(c => c.is_reserve).length,
    guest_only: active.filter(c => c.role_preference === 'guest_only').length,
  }), [active]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'alla', label: 'Alla' },
    { key: 'vantar', label: 'Väntar' },
    { key: 'bekraftade', label: 'Bekräftade' },
    { key: 'inkompletta', label: 'Inkompletta' },
    { key: 'saknar_adress', label: 'Saknar adress' },
    { key: 'reserver', label: 'Reserver' },
  ];

  const selectedCouple = selectedId ? couples.find(c => c.id === selectedId) : null;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
        Laddar gästlista...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Sök namn eller adress..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto overscroll-x-contain scrollbar-hide pb-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                filter === f.key ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            {search ? 'Inga träffar' : 'Inga gäster i denna kategori'}
          </div>
        ) : (
          filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-center justify-between gap-3 ${
                selectedId === c.id ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900 truncate">
                    {c.invited_name}{c.partner_name ? ` & ${c.partner_name}` : ''}
                  </span>
                  <RoleTag role={c.role} rolePreference={c.role_preference} isReserve={c.is_reserve} />
                  <StatusTag confirmed={c.confirmed} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {c.address || '📍 Adress saknas'}
                  {getAllergies(c) && ` · ${getAllergies(c)}`}
                </div>
              </div>
              <span className="text-gray-300 text-sm shrink-0">›</span>
            </button>
          ))
        )}
      </div>

      {/* Slide-over detail panel */}
      {selectedCouple && (
        <GuestDetailPanel
          couple={selectedCouple}
          eventId={eventId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

function RoleTag({ role, rolePreference, isReserve }: { role: string | null; rolePreference: string; isReserve: boolean }) {
  if (isReserve) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">🔄 Reserv</span>;
  if (rolePreference === 'guest_only') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">🍴 Gäst-only</span>;
  if (role === 'host') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">🏠 Värd</span>;
  return null;
}

function StatusTag({ confirmed }: { confirmed: boolean }) {
  if (confirmed) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600">✅</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600">⏳</span>;
}

function getAllergies(c: Couple): string {
  const all = [
    ...(c.invited_allergies || []),
    ...(c.partner_allergies || []),
  ].filter(Boolean);
  if (c.invited_allergy_notes) all.push(c.invited_allergy_notes);
  if (c.partner_allergy_notes) all.push(c.partner_allergy_notes);
  return all.length > 0 ? all.join(', ') : '';
}

/* ── Detail Panel ────────────────────────────────────── */

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  address: string | null;
  coordinates: unknown;
  invited_email: string | null;
  partner_email: string | null;
  invited_allergies: string[] | null;
  partner_allergies: string[] | null;
  invited_allergy_notes: string | null;
  partner_allergy_notes: string | null;
  role: string | null;
  confirmed: boolean;
  is_reserve: boolean;
  role_preference: string;
  cancelled: boolean;
  created_at: string;
}

function GuestDetailPanel({ couple: c, eventId, onClose }: { couple: Couple; eventId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-full max-w-md bg-white shadow-xl h-full overflow-y-auto animate-slide-in-right"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            {c.invited_name}{c.partner_name ? ` & ${c.partner_name}` : ''}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status */}
          <div className="flex gap-2 flex-wrap">
            <RoleTag role={c.role} rolePreference={c.role_preference} isReserve={c.is_reserve} />
            <StatusTag confirmed={c.confirmed} />
          </div>

          {/* Address */}
          <Section title="Adress">
            <p className="text-sm text-gray-700">{c.address || 'Saknas'}</p>
            {!c.coordinates && <p className="text-xs text-amber-600 mt-1">⚠️ Ej geocodad</p>}
          </Section>

          {/* Contact */}
          <Section title="Kontakt">
            {c.invited_email && <p className="text-sm text-gray-700">{c.invited_name}: {c.invited_email}</p>}
            {c.partner_email && <p className="text-sm text-gray-700">{c.partner_name}: {c.partner_email}</p>}
          </Section>

          {/* Allergies */}
          {getAllergies(c) && (
            <Section title="Allergier">
              <p className="text-sm text-gray-700">{getAllergies(c)}</p>
            </Section>
          )}

          {/* Actions */}
          <div className="pt-4 border-t space-y-2">
            <Link
              href={`/organizer/event/${eventId}/guests/${c.id}`}
              className="block w-full text-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              Redigera detaljer →
            </Link>
          </div>
        </div>

        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .animate-slide-in-right {
            animation: slideInRight 0.2s ease-out both;
          }
        `}</style>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{title}</h4>
      {children}
    </div>
  );
}
