'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STATUSES = [
  { value: 'draft', label: 'Utkast', icon: '📝', color: 'bg-gray-100 text-gray-700' },
  { value: 'open', label: 'Öppen', icon: '🟢', color: 'bg-green-100 text-green-700' },
  { value: 'matched', label: 'Matchad', icon: '🔗', color: 'bg-blue-100 text-blue-700' },
  { value: 'locked', label: 'Låst', icon: '🔒', color: 'bg-purple-100 text-purple-700' },
  { value: 'active', label: 'Pågår', icon: '🔥', color: 'bg-orange-100 text-orange-700' },
  { value: 'completed', label: 'Avslutad', icon: '✅', color: 'bg-emerald-100 text-emerald-700' },
] as const;

interface Props {
  eventId: string;
  currentStatus: string;
}

export default function StatusDropdown({ eventId, currentStatus }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const current = STATUSES.find(s => s.value === status) || STATUSES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = async (newStatus: string) => {
    if (newStatus === status) { setOpen(false); return; }
    setSaving(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
        router.refresh(); // revalidate server data (phase cards etc)
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${current.color} hover:opacity-80 disabled:opacity-50`}
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => handleChange(s.value)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                s.value === status ? 'font-semibold' : 'text-gray-700'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
              {s.value === status && <span className="ml-auto text-indigo-500">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
