'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTabParam } from '@/hooks/useTabParam';

type Filter = 'all' | 'waiting' | 'approved' | 'rejected' | 'incomplete' | 'no_ff' | 'cancelled';

interface Couple {
  id: string;
  invited_name: string;
  partner_name: string | null;
  invited_email: string | null;
  partner_email: string | null;
  invited_phone: string | null;
  address: string | null;
  address_unit: string | null;
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
  created_at: string;
  // approval status — we'll add this field
  approval_status?: 'waiting' | 'approved' | 'rejected';
}

export default function GuestsPageWrapper() {
  return <Suspense><GuestsPage /></Suspense>;
}

function GuestsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [filter, setFilter] = useTabParam<Filter>('all', 'filter');

  const [loading, setLoading] = useState(true);
  const [couples, setCouples] = useState<Couple[]>([]);
  const [event, setEvent] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => { loadData(); }, [eventId]);

  async function loadData() {
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/guests`);
      const data = await res.json();
      if (res.ok) {
        setEvent(data.event);
        setCouples(data.couples || []);
      }
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setLoading(false); }
  }

  // Derived counts
  const counts = useMemo(() => {
    const active = couples.filter(c => !c.cancelled);
    const waiting = active.filter(c => !c.confirmed || c.approval_status === 'waiting');
    const approved = active.filter(c => c.confirmed && c.approval_status === 'approved');
    const rejected = active.filter(c => c.approval_status === 'rejected');
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
      rejected: rejected.length,
      incomplete: incomplete.length,
      no_ff: noFf.length,
      cancelled: cancelled.length,
      people: active.reduce((s, c) => s + (c.partner_name ? 2 : 1), 0),
    };
  }, [couples]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = couples;

    // Filter
    switch (filter) {
      case 'waiting':
        list = list.filter(c => !c.cancelled && (!c.confirmed || c.approval_status === 'waiting'));
        break;
      case 'approved':
        list = list.filter(c => !c.cancelled && c.confirmed && c.approval_status === 'approved');
        break;
      case 'rejected':
        list = list.filter(c => c.approval_status === 'rejected');
        break;
      case 'incomplete':
        list = list.filter(c => !c.cancelled && (!c.address || !c.coordinates));
        break;
      case 'no_ff':
        list = list.filter(c => {
          if (c.cancelled) return false;
          const hasInvited = c.invited_fun_facts && c.invited_fun_facts.length > 0;
          const hasPartner = !c.partner_name || (c.partner_fun_facts && c.partner_fun_facts.length > 0);
          return !hasInvited || !hasPartner;
        });
        break;
      case 'cancelled':
        list = list.filter(c => c.cancelled);
        break;
      default:
        list = list.filter(c => !c.cancelled);
    }

    // Search
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

  // Batch actions
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
      if (res.ok) {
        setMessage(`✅ ${data.message || 'Klart!'}`);
        setSelected(new Set());
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch { setMessage('❌ Nätverksfel'); }
    finally { setActing(false); }
  }

  // Toggle selection
  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Laddar...</p></div>;

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Alla', count: counts.all },
    { id: 'waiting', label: 'Väntar', count: counts.waiting },
    { id: 'approved', label: 'Godkända', count: counts.approved },
    { id: 'incomplete', label: 'Inkompletta', count: counts.incomplete },
    { id: 'no_ff', label: 'Saknar FF', count: counts.no_ff },
    { id: 'cancelled', label: 'Avbokade', count: counts.cancelled },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <Link href={`/organizer/event/${eventId}`} className="text-indigo-600 hover:underline text-sm">← {event?.name || 'Tillbaka'}</Link>
          <div className="flex items-center justify-between mt-2">
            <div>
              <h1 className="text-2xl font-bold">👥 Gäster</h1>
              <p className="text-gray-500 text-sm">{counts.all} par · {counts.people} personer</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status summary */}
      <div className="bg-white border-b px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{counts.approved} godkända av {counts.all} anmälda</span>
                <span className="text-sm text-gray-500">{counts.all > 0 ? Math.round(counts.approved / counts.all * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${counts.all > 0 ? (counts.approved / counts.all * 100) : 0}%` }} />
              </div>
            </div>
            {counts.waiting > 0 && (
              <span className="text-sm bg-amber-50 text-amber-700 px-2 py-1 rounded-full whitespace-nowrap">{counts.waiting} väntar</span>
            )}
            {counts.incomplete > 0 && (
              <span className="text-sm bg-red-50 text-red-700 px-2 py-1 rounded-full whitespace-nowrap">{counts.incomplete} inkompletta</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2">
        <div className="max-w-4xl mx-auto flex gap-1 overflow-x-auto overscroll-x-contain scrollbar-hide">
          {filters.map(f => (
            <button key={f.id} onClick={() => { setFilter(f.id); setSelected(new Set()); }}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                filter === f.id
                  ? 'bg-indigo-100 text-indigo-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {f.label} {f.count > 0 && <span className="text-xs opacity-70">{f.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {message && (
          <div className={`p-3 rounded-lg mb-4 text-sm ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message}
            <button onClick={() => setMessage('')} className="float-right text-gray-400">✕</button>
          </div>
        )}

        {/* Search + batch */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <input type="text" placeholder="Sök namn, email, adress..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm" />
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
          </div>
          {(selected.size > 0 || filter === 'waiting' || filter === 'incomplete' || filter === 'no_ff') && (
            <div className="relative">
              <select onChange={e => { if (e.target.value) batchAction(e.target.value); e.target.value = ''; }}
                disabled={acting}
                className="appearance-none bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
                <option value="">Åtgärder ▼</option>
                <option value="approve">✅ Godkänn {selected.size > 0 ? `(${selected.size})` : 'alla'}</option>
                <option value="reject">❌ Neka {selected.size > 0 ? `(${selected.size})` : 'alla'}</option>
                <option value="remind_address">📍 Påminn om adress</option>
                <option value="remind_ff">🎉 Påminn om fun facts</option>
              </select>
            </div>
          )}
        </div>

        {/* Select all */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll} className="w-4 h-4 rounded" />
            <span>{selected.size > 0 ? `${selected.size} markerade` : `${filtered.length} par`}</span>
          </div>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-500">
            <span className="text-4xl block mb-3">{filter === 'all' ? '🦗' : '✨'}</span>
            {filter === 'all' ? 'Inga anmälda ännu' : 'Inga par matchar filtret'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(couple => (
              <GuestRow key={couple.id} couple={couple} eventId={eventId}
                selected={selected.has(couple.id)} onToggle={() => toggleSelect(couple.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GuestRow({ couple, eventId, selected, onToggle }: { couple: Couple; eventId: string; selected: boolean; onToggle: () => void }) {
  const hasAddress = !!couple.address;
  const hasCoords = !!couple.coordinates;
  const hasInvitedFf = !!(couple.invited_fun_facts && couple.invited_fun_facts.length > 0);
  const hasPartnerFf = !couple.partner_name || !!(couple.partner_fun_facts && couple.partner_fun_facts.length > 0);
  const hasFf = hasInvitedFf && hasPartnerFf;
  const allergies = [...(couple.invited_allergies || []), ...(couple.partner_allergies || [])].filter(Boolean);

  // Status badge
  let statusBadge: { text: string; color: string };
  if (couple.cancelled) {
    statusBadge = { text: 'Avbokad', color: 'bg-gray-100 text-gray-500' };
  } else if (couple.approval_status === 'rejected') {
    statusBadge = { text: 'Nekad', color: 'bg-red-100 text-red-700' };
  } else if (!couple.confirmed) {
    statusBadge = { text: 'Ej bekräftad', color: 'bg-amber-100 text-amber-700' };
  } else if (couple.approval_status !== 'approved') {
    statusBadge = { text: 'Väntar', color: 'bg-yellow-100 text-yellow-700' };
  } else {
    statusBadge = { text: 'Godkänd', color: 'bg-green-100 text-green-700' };
  }

  return (
    <div className={`bg-white rounded-lg border p-3 flex items-start gap-3 ${selected ? 'ring-2 ring-indigo-300' : ''} ${couple.cancelled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onToggle}
        className="w-4 h-4 rounded mt-1 shrink-0" />

      <Link href={`/organizer/event/${eventId}/guests/${couple.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 truncate">
            {couple.invited_name}
            {couple.partner_name && <span className="text-gray-400 font-normal"> & {couple.partner_name}</span>}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.color}`}>{statusBadge.text}</span>
          {couple.role === 'reserve' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">🔄 Reserv</span>
          )}
        </div>

        {/* Completeness badges */}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Badge ok={hasAddress && hasCoords} label="📍 Adress" />
          <Badge ok={hasFf} label="🎉 Fun facts" />
          {couple.course_preference && (
            <span className="text-xs text-gray-500">
              🍽️ {couple.course_preference === 'starter' ? 'Förrätt' : couple.course_preference === 'main' ? 'Varmrätt' : 'Dessert'}
            </span>
          )}
          {allergies.length > 0 && (
            <span className="text-xs text-orange-600">⚠️ {allergies.join(', ')}</span>
          )}
          {couple.accessibility_needs && (
            <span className="text-xs text-blue-600">♿ {couple.accessibility_needs}</span>
          )}
          {!couple.accessibility_ok && (
            <span className="text-xs text-purple-600">🏠 Ej tillgängligt</span>
          )}
          {!couple.partner_name && (
            <span className="text-xs text-gray-400">Solo</span>
          )}
        </div>

        {couple.invited_email && (
          <p className="text-xs text-gray-400 mt-1 truncate">{couple.invited_email}</p>
        )}
      </Link>
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
