'use client';

import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { countFunFacts } from '@/lib/fun-facts';

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
  invited_fun_facts: unknown;
  partner_fun_facts: unknown;
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

  async function singleAction(coupleId: string, action: string) {
    setActing(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/guests/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, couple_ids: [coupleId] }),
      });
      const data = await res.json();
      if (res.ok) { setMessage(`✅ ${data.message || 'Klart!'}`); loadData(); }
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
      const hasInvited = countFunFacts(c.invited_fun_facts) > 0;
      const hasPartner = !c.partner_name || countFunFacts(c.partner_fun_facts) > 0;
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
        const hasInvited = countFunFacts(c.invited_fun_facts) > 0;
        const hasPartner = !c.partner_name || countFunFacts(c.partner_fun_facts) > 0;
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

      {/* ── Sticky toolbar ── */}
      <div className="sticky top-[94px] z-20 bg-white -mx-6 px-6 pt-2 pb-3 space-y-3 border-b border-gray-100">
        {/* Filter tabs with scroll indicators */}
        <FilterTabsScroll filters={filters} activeFilter={filter} onFilterChange={setFilter} />

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

        {/* Select all / count */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll} className="w-4 h-4 rounded" />
            <span>{selected.size > 0 ? `${selected.size} markerade` : `${filtered.length} par`}</span>
          </div>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 rounded-lg text-sm flex items-center justify-between ${message.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
          <button onClick={() => setMessage('')} className="text-gray-400 ml-2">✕</button>
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
              selected={selected.has(c.id)} onToggle={() => toggleSelect(c.id)}
              onAction={(action) => singleAction(c.id, action)} />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ── GuestRow ──────────────────────────────────────────── */

function GuestRow({ couple: c, eventId, selected, onToggle, onAction }: {
  couple: Couple; eventId: string; selected: boolean; onToggle: () => void;
  onAction: (action: string) => void;
}) {
  const [swipeMode, setSwipeMode] = useState<'approve' | 'reject' | 'context' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const hasAddress = !!c.address && !!c.coordinates;
  const hasInvitedFf = countFunFacts(c.invited_fun_facts) > 0;
  const hasPartnerFf = !c.partner_name || countFunFacts(c.partner_fun_facts) > 0;
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

  const SWIPE_THRESHOLD = 80;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);
    if (absX > SWIPE_THRESHOLD && absX > absY) {
      if (info.offset.x > 0) setSwipeMode('approve');
      else setSwipeMode('reject');
    }
  };

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => setSwipeMode('context'), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const handleAction = (action: string) => {
    setSwipeMode(null);
    onAction(action);
  };

  return (
    <div className={`relative rounded-lg ${swipeMode ? 'z-20' : ''}`}>
      {/* Swipe action panels */}
      <AnimatePresence>
        {swipeMode === 'approve' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute inset-x-0 -top-1 bg-white border border-green-200 rounded-lg shadow-lg p-2 z-30">
            <div className="flex items-center gap-2">
              <button onClick={() => handleAction('approve')}
                className="flex-1 px-3 py-2 text-sm bg-green-500 text-white rounded-lg font-medium hover:bg-green-600">
                ✅ Godkänn
              </button>
              <button onClick={() => setSwipeMode(null)}
                className="px-2 py-2 text-sm text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </motion.div>
        )}
        {swipeMode === 'reject' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute inset-x-0 -top-1 bg-white border border-red-200 rounded-lg shadow-lg p-2 z-30">
            <div className="flex items-center gap-2">
              <button onClick={() => handleAction('reject')}
                className="flex-1 px-3 py-2 text-sm bg-red-500 text-white rounded-lg font-medium hover:bg-red-600">
                ❌ Neka
              </button>
              <button onClick={() => handleAction('cancel')}
                className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                🚫 Avboka
              </button>
              <button onClick={() => setSwipeMode(null)}
                className="px-2 py-2 text-sm text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </motion.div>
        )}
        {swipeMode === 'context' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute inset-x-0 -top-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-30">
            <div className="flex flex-col gap-1">
              <button onClick={() => handleAction('approve')}
                className="w-full px-3 py-2 text-sm text-left rounded hover:bg-gray-50">✅ Godkänn</button>
              <button onClick={() => handleAction('reject')}
                className="w-full px-3 py-2 text-sm text-left rounded hover:bg-gray-50">❌ Neka</button>
              <button onClick={() => handleAction('remind_address')}
                className="w-full px-3 py-2 text-sm text-left rounded hover:bg-gray-50">📍 Påminn om adress</button>
              <button onClick={() => handleAction('remind_ff')}
                className="w-full px-3 py-2 text-sm text-left rounded hover:bg-gray-50">🎉 Påminn om fun facts</button>
              <div className="border-t border-gray-100 my-1" />
              <Link href={`/organizer/event/${eventId}/guests/${c.id}`} onClick={() => setSwipeMode(null)}
                className="w-full px-3 py-2 text-sm text-left rounded hover:bg-gray-50">✏️ Redigera</Link>
              <Link href={`/organizer/event/${eventId}/guests/${c.id}/preferences`} onClick={() => setSwipeMode(null)}
                className="w-full px-3 py-2 text-sm text-left rounded hover:bg-gray-50">🔀 Matchningspreferens</Link>
              <button onClick={() => setSwipeMode(null)}
                className="w-full px-3 py-1.5 text-xs text-gray-400 text-center">Stäng</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Swipeable card content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        whileTap={{ scale: 0.98 }}
        className={`bg-white rounded-lg border p-3 flex items-start gap-3 ${selected ? 'ring-2 ring-indigo-300' : ''} ${c.cancelled ? 'opacity-50' : ''}`}
      >
        <input type="checkbox" checked={selected} onChange={onToggle}
          className="w-4 h-4 rounded mt-1 shrink-0" />

        <Link href={`/organizer/event/${eventId}/guests/${c.id}`} className="flex-1 min-w-0"
          onClick={e => { if (swipeMode) e.preventDefault(); }}>
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

        {/* Desktop: ⋮ menu */}
        <div className="relative shrink-0 hidden md:block">
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="13" r="1.2" />
            </svg>
          </button>
          {menuOpen && (
            <RowMenu eventId={eventId} coupleId={c.id} onClose={() => setMenuOpen(false)} onAction={handleAction} />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function RowMenu({ eventId, coupleId, onClose, onAction }: {
  eventId: string; coupleId: string; onClose: () => void; onAction: (action: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={menuRef} className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-30">
      <button onClick={() => { onAction('approve'); onClose(); }}
        className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">✅ Godkänn</button>
      <button onClick={() => { onAction('reject'); onClose(); }}
        className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">❌ Neka</button>
      <div className="border-t border-gray-100 my-1" />
      <button onClick={() => { onAction('remind_address'); onClose(); }}
        className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">📍 Påminn om adress</button>
      <button onClick={() => { onAction('remind_ff'); onClose(); }}
        className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">🎉 Påminn om fun facts</button>
      <div className="border-t border-gray-100 my-1" />
      <Link href={`/organizer/event/${eventId}/guests/${coupleId}`} onClick={onClose}
        className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">✏️ Redigera</Link>
      <Link href={`/organizer/event/${eventId}/guests/${coupleId}/preferences`} onClick={onClose}
        className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">🔀 Matchningspreferens</Link>
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

/* ── Filter tabs with scroll arrows ──────────────────── */

function FilterTabsScroll({ filters, activeFilter, onFilterChange }: {
  filters: { id: Filter; label: string; count: number }[];
  activeFilter: Filter;
  onFilterChange: (id: Filter) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasCountRight, setHasCountRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sl = el.scrollLeft;
    const sw = el.scrollWidth;
    const cw = el.clientWidth;
    setCanScrollLeft(sl > 4);
    setCanScrollRight(sw - sl - cw > 4);

    // Check if any hidden-right filter has count > 0
    const buttons = el.querySelectorAll<HTMLElement>('[data-filter-id]');
    let found = false;
    buttons.forEach(btn => {
      const rect = btn.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      if (rect.right > containerRect.right) {
        const id = btn.getAttribute('data-filter-id') || '';
        const f = filters.find(f => f.id === id);
        if (f && f.count > 0) found = true;
      }
    });
    setHasCountRight(found);
  }, [filters]);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      if (el) el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' });
  };

  return (
    <div className="relative flex items-center">
      {/* Left arrow */}
      {canScrollLeft && (
        <button onClick={() => scroll('left')}
          className="absolute left-0 z-10 w-7 h-7 flex items-center justify-center bg-white/90 rounded-full shadow text-gray-400 hover:text-gray-600 -ml-1">
          ‹
        </button>
      )}

      <div ref={scrollRef} className="flex gap-1 overflow-x-auto overscroll-x-contain scrollbar-hide px-1">
        {filters.map(f => (
          <button
            key={f.id}
            data-filter-id={f.id}
            onClick={() => onFilterChange(f.id as Filter)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              activeFilter === f.id
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {f.label} {f.count > 0 && <span className="text-xs opacity-70">{f.count}</span>}
          </button>
        ))}
      </div>

      {/* Right arrow — highlighted if hidden tabs have counts */}
      {canScrollRight && (
        <button onClick={() => scroll('right')}
          className={`absolute right-0 z-10 w-7 h-7 flex items-center justify-center rounded-full shadow -mr-1 ${
            hasCountRight
              ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
              : 'bg-white/90 text-gray-400 hover:text-gray-600'
          }`}>
          ›
        </button>
      )}
    </div>
  );
}
