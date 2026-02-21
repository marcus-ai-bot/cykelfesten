'use client';

import type { MealGroup, CourseConfig } from './types';

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface Props {
  group: MealGroup;
  cfg: CourseConfig;
  courseName: string;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  groupIndex: number;
  groupTotal: number;
}

export function MealGroupCard({ group, cfg, courseName, onClose, onPrev, onNext, groupIndex, groupTotal }: Props) {
  const allAllergies = [
    ...group.hostAllergies,
    ...group.guests.flatMap((g) => g.allergies),
  ].filter(Boolean);
  const uniqueAllergies = [...new Set(allAllergies)];

  return (
    <>
      {/* Desktop: left panel */}
      <div className="hidden md:block absolute top-4 left-4 z-10 w-80 max-h-[calc(100vh-180px)] overflow-y-auto">
        <CardContent
          group={group} cfg={cfg} courseName={courseName}
          onClose={onClose} onPrev={onPrev} onNext={onNext}
          groupIndex={groupIndex} groupTotal={groupTotal}
          uniqueAllergies={uniqueAllergies}
        />
      </div>
      {/* Mobile: bottom sheet */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 z-10 max-h-[60vh] overflow-y-auto">
        <CardContent
          group={group} cfg={cfg} courseName={courseName}
          onClose={onClose} onPrev={onPrev} onNext={onNext}
          groupIndex={groupIndex} groupTotal={groupTotal}
          uniqueAllergies={uniqueAllergies}
          mobile
        />
      </div>
    </>
  );
}

function CardContent({
  group, cfg, courseName, onClose, onPrev, onNext,
  groupIndex, groupTotal, uniqueAllergies, mobile,
}: Props & { uniqueAllergies: string[]; mobile?: boolean }) {
  return (
    <div className={`bg-white shadow-xl border border-gray-100 overflow-hidden ${
      mobile ? 'rounded-t-2xl' : 'rounded-2xl'
    }`}>
      {/* Drag handle (mobile) */}
      {mobile && (
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
      )}

      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: `${cfg.color}08` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{cfg.emoji}</span>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: cfg.color }}>
                {courseName} · {cfg.time}
              </div>
              <div className="font-semibold text-gray-900 text-sm mt-0.5">
                Hos {group.hostName}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Host */}
      <div className="px-5 py-3 border-b border-gray-50">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm mt-0.5" style={{ backgroundColor: cfg.color }}>
            🏠
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{group.hostName}</div>
            <div className="text-xs text-gray-500 mt-0.5">{group.hostAddress}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: cfg.color }}>
                Värd
              </span>
              <span className="text-xs text-gray-400">
                {group.totalPeople} pers totalt
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Guests */}
      <div className="px-5 py-3">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
          🚲 Gäster ({group.guests.length} par)
        </div>
        <div className="space-y-2.5">
          {group.guests.map((guest) => {
            const dist = haversineKm(guest.coords, group.hostCoords);
            const minutes = Math.round(dist / 0.25);
            return (
              <div key={guest.id} className="flex items-start gap-3 py-1">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs mt-0.5 shrink-0">
                  🚲
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{guest.name}</div>
                  <div className="text-xs text-gray-400 truncate">{guest.address}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {dist < 0.1 ? '< 100 m' : `${dist.toFixed(1)} km`} · ~{Math.max(1, minutes)} min
                  </div>
                </div>
              </div>
            );
          })}
          {group.guests.length === 0 && (
            <div className="text-xs text-gray-400 italic py-2">Inga gäster tilldelade</div>
          )}
        </div>
      </div>

      {/* Allergies */}
      {uniqueAllergies.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-50 bg-red-50/50">
          <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1.5">
            ⚠️ Allergier i gruppen
          </div>
          <div className="flex flex-wrap gap-1.5">
            {uniqueAllergies.map((a) => (
              <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default transition px-2 py-1 rounded hover:bg-gray-50"
        >
          ← Föregående
        </button>
        <span className="text-xs text-gray-400">
          {groupIndex + 1} / {groupTotal}
        </span>
        <button
          onClick={onNext ?? undefined}
          disabled={!onNext}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default transition px-2 py-1 rounded hover:bg-gray-50"
        >
          Nästa →
        </button>
      </div>
    </div>
  );
}
