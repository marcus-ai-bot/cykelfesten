'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AddressAutocomplete from '@/components/AddressAutocomplete';

interface Couple {
  id: string;
  event_id: string;
  invited_name: string;
  invited_email: string | null;
  invited_phone: string | null;
  invited_allergies: string[] | null;
  invited_birth_year: number | null;
  invited_fun_facts: string[] | null;
  invited_pet_allergy: string;
  partner_name: string | null;
  partner_email: string | null;
  partner_phone: string | null;
  partner_allergies: string[] | null;
  partner_birth_year: number | null;
  partner_fun_facts: string[] | null;
  partner_pet_allergy: string;
  address: string | null;
  address_unit: string | null;
  address_notes: string | null;
  course_preference: string | null;
  instagram_handle: string | null;
  accessibility_needs: string | null;
  accessibility_ok: boolean;
  confirmed: boolean;
  cancelled: boolean;
  created_at: string;
  events: { id: string; name: string; slug: string };
}

export default function CoupleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const coupleId = params.coupleId as string;

  const [couple, setCouple] = useState<Couple | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    fetch(`/api/organizer/couples/${coupleId}`)
      .then(r => r.json())
      .then(data => {
        if (data.couple) {
          setCouple(data.couple);
          setForm(data.couple);
        } else {
          setError('Par hittades inte');
        }
      })
      .catch(() => setError('Kunde inte ladda data'))
      .finally(() => setLoading(false));
  }, [coupleId]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/organizer/couples/${coupleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setCouple(data.couple);
        setForm(data.couple);
        setEditing(false);
        setSuccess('Sparat!');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(data.error || 'Kunde inte spara');
      }
    } catch {
      setError('Nätverksfel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Vill du verkligen ta bort ${couple?.invited_name}${couple?.partner_name ? ` & ${couple.partner_name}` : ''}? De markeras som avhoppade.`)) return;
    try {
      const res = await fetch(`/api/organizer/couples/${coupleId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push(`/organizer/event/${eventId}/guests`);
      } else {
        const data = await res.json();
        setError(data.error || 'Kunde inte ta bort');
      }
    } catch {
      setError('Nätverksfel');
    }
  };

  const handleSplit = async () => {
    if (!confirm(`Koppla isär ${couple?.invited_name} och ${couple?.partner_name}? Partnern blir en egen anmälan.`)) return;
    try {
      const res = await fetch(`/api/organizer/couples/${coupleId}/split`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        // Reload couple data
        const r2 = await fetch(`/api/organizer/couples/${coupleId}`);
        const d2 = await r2.json();
        if (d2.couple) { setCouple(d2.couple); setForm(d2.couple); }
      } else {
        setError(data.error || 'Kunde inte koppla isär');
      }
    } catch {
      setError('Nätverksfel');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Laddar...</p>
      </div>
    );
  }

  if (!couple) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">😕</p>
          <p className="text-gray-600">{error || 'Hittades inte'}</p>
          <Link href={`/organizer/event/${eventId}/guests`} className="text-indigo-600 mt-4 inline-block">
            ← Tillbaka
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link href={`/organizer/event/${eventId}/guests`} className="text-gray-500 hover:text-gray-700">
            ← Gästlista
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {couple.invited_name}
            {couple.partner_name && <span className="text-gray-400 font-normal"> &amp; {couple.partner_name}</span>}
          </h1>
          <div className="flex gap-2">
            {!editing ? (
              <button onClick={() => setEditing(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                ✏️ Redigera
              </button>
            ) : (
              <>
                <button onClick={() => { setEditing(false); setForm(couple); }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm">
                  Avbryt
                </button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  {saving ? 'Sparar...' : '💾 Spara'}
                </button>
              </>
            )}
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4">{success}</div>}

        {/* Matching Preferences */}
        <div className="mb-4">
          <Link
            href={`/organizer/event/${eventId}/guests/${coupleId}/preferences`}
            className="block bg-indigo-50 border-2 border-indigo-200 rounded-xl p-5 hover:bg-indigo-100 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-indigo-900">🎯 Matchningspreferenser</h3>
                <p className="text-sm text-indigo-600 mt-1">
                  Ställ in vilka par som ska/inte ska mötas vid middagen
                </p>
              </div>
              <span className="text-indigo-400 text-2xl">→</span>
            </div>
          </Link>
        </div>

        {/* Invited Person */}
        <Section title="👤 Anmälare">
          <Field label="Namn" field="invited_name" form={form} setForm={setForm} editing={editing} />
          <Field label="Email" field="invited_email" form={form} setForm={setForm} editing={editing} />
          <Field label="Telefon" field="invited_phone" form={form} setForm={setForm} editing={editing} />
          <Field label="Födelseår" field="invited_birth_year" form={form} setForm={setForm} editing={editing} type="number" />
          <Field label="Allergier" field="invited_allergies" form={form} setForm={setForm} editing={editing} isArray />
          <SelectField label="Djurallergi" field="invited_pet_allergy" form={form} setForm={setForm} editing={editing}
            options={[['none', 'Ingen'], ['cat', 'Katt'], ['dog', 'Hund'], ['both', 'Katt & hund']]} />
          <Field label="Fun facts" field="invited_fun_facts" form={form} setForm={setForm} editing={editing} isArray />
        </Section>

        {/* Partner */}
        {couple.partner_name && (
          <Section title="👤 Partner">
            <Field label="Namn" field="partner_name" form={form} setForm={setForm} editing={editing} />
            <Field label="Email" field="partner_email" form={form} setForm={setForm} editing={editing} />
            <Field label="Födelseår" field="partner_birth_year" form={form} setForm={setForm} editing={editing} type="number" />
            <Field label="Allergier" field="partner_allergies" form={form} setForm={setForm} editing={editing} isArray />
            <SelectField label="Djurallergi" field="partner_pet_allergy" form={form} setForm={setForm} editing={editing}
              options={[['none', 'Ingen'], ['cat', 'Katt'], ['dog', 'Hund'], ['both', 'Katt & hund']]} />
            <Field label="Fun facts" field="partner_fun_facts" form={form} setForm={setForm} editing={editing} isArray />
          </Section>
        )}

        {/* Shared Info */}
        <Section title="🏠 Gemensamt">
          {editing ? (
            <div className="flex items-center gap-3 py-1.5">
              <label className="text-sm text-gray-500 w-32 shrink-0">Adress</label>
              <AddressAutocomplete
                value={form.address || ''}
                onChange={(address, coordinates) => {
                  setForm((prev: any) => ({
                    ...prev,
                    address,
                    ...(coordinates ? { address_coordinates: coordinates } : {}),
                  }));
                }}
                proximity={undefined}
                placeholder="Storgatan 12, Piteå"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          ) : (
            <Field label="Adress" field="address" form={form} setForm={setForm} editing={editing} />
          )}
          <Field label="Lägenhet/port" field="address_unit" form={form} setForm={setForm} editing={editing} />
          <Field label="Adressnotering" field="address_notes" form={form} setForm={setForm} editing={editing} />
          <SelectField label="Rättsönskemål" field="course_preference" form={form} setForm={setForm} editing={editing}
            options={[['', 'Inget'], ['starter', 'Förrätt'], ['main', 'Huvudrätt'], ['dessert', 'Dessert']]} />
          <Field label="Instagram" field="instagram_handle" form={form} setForm={setForm} editing={editing} />
          <Field label="Tillgänglighetsbehov" field="accessibility_needs" form={form} setForm={setForm} editing={editing} />
        </Section>

        {/* Meta */}
        <Section title="ℹ️ Info">
          <div className="text-sm text-gray-500 space-y-1">
            <p>Anmäld: {new Date(couple.created_at).toLocaleString('sv-SE')}</p>
            <p>Status: {couple.cancelled ? '❌ Avhoppad' : couple.confirmed ? '✅ Bekräftad' : '⏳ Ej bekräftad'}</p>
          </div>
        </Section>

        {/* Danger Zone */}
        <div className="mt-8 border border-red-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-red-700 mb-4">⚠️ Åtgärder</h3>
          <div className="space-y-3">
            {couple.partner_name && (
              <button onClick={handleSplit} className="w-full text-left px-4 py-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors">
                ✂️ Koppla isär — {couple.invited_name} och {couple.partner_name} blir separata anmälningar
              </button>
            )}
            <button onClick={handleDelete} className="w-full text-left px-4 py-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors">
              🗑️ Ta bort anmälan — markerar paret som avhoppat
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
      <h2 className="font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, field, form, setForm, editing, type = 'text', isArray = false }: {
  label: string; field: string; form: Record<string, any>; setForm: (f: any) => void; editing: boolean; type?: string; isArray?: boolean;
}) {
  const value = form[field];
  const display = isArray ? (value || []).join(', ') : (value ?? '—');

  if (!editing) {
    return (
      <div className="flex justify-between py-1.5 border-b border-gray-50">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm text-gray-900">{display || '—'}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <label className="text-sm text-gray-500 w-32 shrink-0">{label}</label>
      <input
        type={type}
        value={isArray ? (value || []).join(', ') : (value ?? '')}
        onChange={(e) => {
          const val = isArray
            ? e.target.value.split(',').map(s => s.trim()).filter(Boolean)
            : type === 'number' ? (e.target.value ? parseInt(e.target.value) : null) : e.target.value;
          setForm((prev: any) => ({ ...prev, [field]: val }));
        }}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>
  );
}

function SelectField({ label, field, form, setForm, editing, options }: {
  label: string; field: string; form: Record<string, any>; setForm: (f: any) => void; editing: boolean;
  options: [string, string][];
}) {
  const value = form[field] ?? '';
  const displayLabel = options.find(([v]) => v === value)?.[1] || value || '—';

  if (!editing) {
    return (
      <div className="flex justify-between py-1.5 border-b border-gray-50">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm text-gray-900">{displayLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <label className="text-sm text-gray-500 w-32 shrink-0">{label}</label>
      <select
        value={value}
        onChange={(e) => setForm((prev: any) => ({ ...prev, [field]: e.target.value }))}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
