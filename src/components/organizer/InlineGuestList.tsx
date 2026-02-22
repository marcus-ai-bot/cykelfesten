'use client';

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import Link from 'next/link';

const RegistrationMap = lazy(() => import('./RegistrationMap').then(m => ({ default: m.RegistrationMap })));

type Filter = 'all' | 'waiting' | 'approved' | 'incomplete' | 'no_ff' | 'cancelled';

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  invited_email: string | null;
  partner_email: string | null;
  address: string | null;
  coordinates: string | null;
  confirmed: boolean;
  cancelled: boolean;
  role: string;
  course_preference: string | null;
  invited_allergies: string[] | null;
  partner_allergies: string[] | null;
  invited_fun_facts: string[] | null;
  partner_fun_facts: string[] | null;
  accessibility_ok: boolean;
  accessibility_needs: string | null;
  approval_status?: 'waiting' | 'approved' | 'rejected';
  created_at: string;
}

interface Props {
  eventId: string;
}

export function InlineGuestList({ eventId }: Props) {
  const [view, setView] = useState<'lista' | 'karta'>('lista');
  const [couples, setCouples] = useState<Couple[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/organizer/events/${eventId}/guests`)
      .then(r => r.json())
      .then(data => { setCouples(data.couples || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [eventId]);

  const active = useMemo(() => couples.filter(c => !c.cancelled), [couples]);

  const counts = useMemo(() => {
    const waiting = active.filter(c => !c.confirmed || c.approval_status === 'waiting');
    const approved = active.filter(c => c.confirmed && c.approval_status === 'approved');
    const incomplete = active.filter(c => !c.address || !c.coordinates);
    const noFf = active.filter(c => {
      const hasInvited = c.invited_fun_facts && c.invited_fun_facts.length > 0;
      const hasPartner = !c.partner_name || (c.partner_fun_facts && c.partner_fun_facts.length > 0);
      return !hasInvited || !hasPartner;
    });
    const cancelled = couples.filter(c => c.cancelled);
    return {
      all: active.length,
      waiting: waiting.length,
      approved: approved.length,
      incomplete: incomplete.length,
      no_ff: noFf.length,
      cancelled: cancelled.length,
      people: active.reduce((s, c) => s + (c.partner_name ? 2 : 1), 0),
    };
  }, [active, couples]);

  const filtered = useMemo(() => {
    let list = couples;
    switch (filter) {
      case 'waiting': list = list.filter(c => !c.cancelled && (!c.confirmed || c.approval_status === 'waiting')); break;
      case 'approved': list = list.filter(c => !c.cancelled && c.confirmed && c.approval_status === 'approved'); break;
      case 'incomplete': list = list.filter(c => !c.cancelled && (!c.address || !c.coordinates)); break;
      case 'no_ff': list = list.filter(c => {
        if (c.cancelled) return false;
        const hasInvited = c.invited_fun_facts && c.invited_fun_facts.length > 0;
        const hasPartner = !c.partner_name || (c.partner_fun_facts && c.partner_fun_facts.length > 0);
        return !hasInvited || !hasPartner;
      }); break;
      case 'cancelled': list = list.filter(c => c.cancelled); break;
      default: list = list.filter(c => !c.cancelled);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.invited_name?.toLowerCase().includes(q) ||
        c.partner_name?.toLowerCase().includes(q) ||
        c.invited_email?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [couples, filter, search]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Alla', count: counts.all },
    { id: 'waiting', label: 'Väntar', count: counts.waiting },
    { id: 'approved', label: 'Godkända', count: counts.approved },
    { id: 'incomplete', label: 'Inkompletta', count: counts.incomplete },
    { id: 'no_ff', label: 'Saknar FF', count: counts.no_ff },
    { id: 'cancelled', label: 'Avbokade', count: counts.cancelled },
  ];

  if (loading) {
    return <div className="py-8 text-center text-gray-400 text-sm">Laddar gästlista...</div>;
  }

  const approvalPct = counts.all > 0 ? Math.round(counts.approved / counts.all * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Lista / Karta tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setView('lista')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            view === 'lista'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📋 Lista
        </button>
        <button
          onClick={() => setView('karta')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            view === 'karta'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🗺️ Karta
        </button>
      </div>

      {view === 'karta' ? (
        <Suspense fallback={<div className="h-[400px] rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Laddar karta...</div>}>
          <RegistrationMap eventId={eventId} />
        </Suspense>
      ) : (
      <>
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-600">
            {counts.all} par · {counts.people} personer
          </span>
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">
            {counts.approved} godkända av {counts.all} anmälda
          </span>
          <span className="text-sm text-gray-500">{approvalPct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${approvalPct}%` }}
          />
        </div>
        {(counts.waiting > 0 || counts.incomplete > 0) && (
          <div className="flex gap-2 mt-2">
            {counts.waiting > 0 && (
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{counts.waiting} väntar</span>
            )}
            {counts.incomplete > 0 && (
              <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{counts.incomplete} inkompletta</span>
            )}
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto overscroll-x-contain scrollbar-hide">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              filter === f.id
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {f.label} {f.count > 0 && <span className="text-xs opacity-70">{f.count}</span>}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Sök namn, email, adress..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">
          {search ? 'Inga träffar' : filter === 'all' ? 'Inga anmälda ännu' : 'Inga par matchar filtret'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <GuestRow key={c.id} couple={c} eventId={eventId} />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ── GuestRow ──────────────────────────────────────────── */

function GuestRow({ couple: c, eventId }: { couple: Couple; eventId: string }) {
  const hasAddress = !!c.address && !!c.coordinates;
  const hasInvitedFf = !!(c.invited_fun_facts && c.invited_fun_facts.length > 0);
  const hasPartnerFf = !c.partner_name || !!(c.partner_fun_facts && c.partner_fun_facts.length > 0);
  const hasFf = hasInvitedFf && hasPartnerFf;
  const allergies = [...(c.invited_allergies || []), ...(c.partner_allergies || [])].filter(Boolean);

  let statusBadge: { text: string; color: string };
  if (c.cancelled) {
    statusBadge = { text: 'Avbokad', color: 'bg-gray-100 text-gray-500' };
  } else if (!c.confirmed) {
    statusBadge = { text: 'Ej bekräftad', color: 'bg-amber-100 text-amber-700' };
  } else if (c.approval_status !== 'approved') {
    statusBadge = { text: 'Väntar', color: 'bg-yellow-100 text-yellow-700' };
  } else {
    statusBadge = { text: 'Godkänd', color: 'bg-green-100 text-green-700' };
  }

  return (
    <Link
      href={`/organizer/event/${eventId}/guests/${c.id}`}
      className={`block bg-white rounded-lg border p-3 hover:border-indigo-200 hover:shadow-sm transition ${c.cancelled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm text-gray-900 truncate">
          {c.invited_name}
          {c.partner_name && <span className="text-gray-400 font-normal"> & {c.partner_name}</span>}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.color}`}>{statusBadge.text}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-1.5">
        <Badge ok={hasAddress} label="📍 Adress" />
        <Badge ok={hasFf} label="🎉 Fun facts" />
        {allergies.length > 0 && <span className="text-xs text-orange-600">⚠️ {allergies.join(', ')}</span>}
        {!c.partner_name && <span className="text-xs text-gray-400">Solo</span>}
      </div>

      {c.invited_email && (
        <p className="text-xs text-gray-400 mt-1 truncate">{c.invited_email}</p>
      )}
    </Link>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs ${ok ? 'text-green-600' : 'text-red-500 font-medium'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}
