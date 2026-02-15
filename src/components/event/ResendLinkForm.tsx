'use client';

import { useState } from 'react';

export function ResendLinkForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/register/resend-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email }),
      });
      setSent(true);
    } catch {
      setSent(true); // Show success regardless (don't reveal if email exists)
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <div className="text-center mt-8">
        <button
          onClick={() => setExpanded(true)}
          className="text-amber-600 hover:text-amber-700 text-sm underline"
        >
          Redan anmäld? Skicka min länk
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="mt-8 bg-white rounded-xl p-6 shadow-lg text-center">
        <div className="text-3xl mb-2">📧</div>
        <p className="text-amber-700">
          Om din email finns i systemet får du en länk inom kort. Kolla även skräpposten!
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 bg-white rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-amber-900 mb-2">🔑 Skicka min länk</h3>
      <p className="text-amber-600 text-sm mb-4">
        Ange din email så skickar vi din personliga länk.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="din@email.se"
          required
          className="flex-1 px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? 'Skickar...' : 'Skicka'}
        </button>
      </form>
    </div>
  );
}
