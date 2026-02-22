'use client';

import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');

  function loadData() {
    fetch(`/api/organizer/events/${eventId}/guests`)
      .then(r => r.json())
      .then(data => { setCouples(data.couples || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [eventId]);

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  }

  async function batchAction(action: string) {
    const ids = selected.size > 0 ? Array.from(selected) : filtered.map(c => c.id);
    if (ids.length === 0) return;
    const labels: Record<string, string> = {
      approve: `Godkänn ${ids.length} par`,
      reject: `Neka ${ids.length} par`,
      remind_address: `Påminn ${ids.length} par om adress`,
      remind_ff: `Påminn ${ids.length} par om fun facts`,
    };
    if (!confirm(`${labels[action] || action}?`)) return;
    setActing(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/guests/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, couple_ids: ids }),
      });
      const data = await res.json();
      if (res.ok) { setMessage(`✅ ${data.message || 'Klart!'}`); setSelected(new Set()); loadData(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setActing(false); }
  }

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

      {/* Message */}
      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-center justify-between ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
          <button onClick={() => setMessage('')} className="text-gray-400 ml-2">✕</button>
        </div>
      )}

      {/* Search + batch actions */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Sök namn, email, adress..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
        </div>
        {(selected.size > 0 || filter === 'waiting' || filter === 'incomplete' || filter === 'no_ff') && (
          <select
            onChange={e => { if (e.target.value) batchAction(e.target.value); e.target.value = ''; }}
            disabled={acting}
            className="appearance-none bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 shrink-0"
          >
            <option value="">Åtgärder ▼</option>
            <option value="approve">✅ Godkänn {selected.size > 0 ? `(${selected.size})` : 'alla'}</option>
            <option value="reject">❌ Neka {selected.size > 0 ? `(${selected.size})` : 'alla'}</option>
            <option value="remind_address">📍 Påminn om adress</option>
            <option value="remind_ff">🎉 Påminn om fun facts</option>
          </select>
        )}
      </div>

      {/* Select all */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
            onChange={toggleAll} className="w-4 h-4 rounded" />
          <span>{selected.size > 0 ? `${selected.size} markerade` : `${filtered.length} par`}</span>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">
          {search ? 'Inga träffar' : filter === 'all' ? 'Inga anmälda ännu' : 'Inga par matchar filtret'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <GuestRow key={c.id} couple={c} eventId={eventId}
              selected={selected.has(c.id)} onToggle={() => toggleSelect(c.id)} />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ── GuestRow ──────────────────────────────────────────── */

function GuestRow({ couple: c, eventId, selected, onToggle }: {
  couple: Couple; eventId: string; selected: boolean; onToggle: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className={`bg-white rounded-lg border p-3 flex items-start gap-3 ${selected ? 'ring-2 ring-indigo-300' : ''} ${c.cancelled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onToggle}
        className="w-4 h-4 rounded mt-1 shrink-0" />

      <Link href={`/organizer/event/${eventId}/guests/${c.id}`} className="flex-1 min-w-0">
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

      {/* Row menu */}
      <div className="relative shrink-0">
        <button onClick={() => setMenuOpen(!menuOpen)}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="13" r="1.2" />
          </svg>
        </button>
        {menuOpen && (
          <RowMenu
            eventId={eventId}
            coupleId={c.id}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function RowMenu({ eventId, coupleId, onClose }: { eventId: string; coupleId: string; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30">
      <Link href={`/organizer/event/${eventId}/guests/${coupleId}`} onClick={onClose}
        className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">✏️ Redigera</Link>
      <Link href={`/organizer/event/${eventId}/guests/${coupleId}/preferences`} onClick={onClose}
        className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">🍽️ Preferenser</Link>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs ${ok ? 'text-green-600' : 'text-red-500 font-medium'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  );
}
