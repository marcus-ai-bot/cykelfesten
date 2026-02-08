'use client';

/**
 * Admin Awards Settings
 * 
 * - Enable/disable specific awards (some are sensitive)
 * - Write "thank you" message
 * - Preview awards
 * - Manual award assignment override
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { AWARDS, type Award } from '@/lib/awards/calculate';

// Awards that are potentially sensitive (default OFF)
const SENSITIVE_AWARDS = [
  'oldest',
  'youngest', 
  'most_allergies',
  'only_vegetarian',
  'least_fun_facts',
  'average_age',
];

interface EventSettings {
  id: string;
  name: string;
  enabled_awards: string[] | null;
  thank_you_message: string | null;
}

interface AwardAssignment {
  id: string;
  couple_id: string;
  person_type: string;
  award_id: string;
  value: string | null;
  couples?: {
    invited_name: string;
    partner_name: string | null;
  };
}

export default function AdminAwardsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState<EventSettings | null>(null);
  const [enabledAwards, setEnabledAwards] = useState<Set<string>>(new Set());
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [assignments, setAssignments] = useState<AwardAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'assignments' | 'preview'>('settings');
  
  const supabase = createClient();
  
  useEffect(() => {
    loadData();
  }, [eventId]);
  
  async function loadData() {
    setLoading(true);
    
    // Get event settings
    const { data: eventData } = await supabase
      .from('events')
      .select('id, name, enabled_awards, thank_you_message')
      .eq('id', eventId)
      .single();
    
    if (eventData) {
      setEvent(eventData);
      
      // Set enabled awards (default: all non-sensitive)
      if (eventData.enabled_awards) {
        setEnabledAwards(new Set(eventData.enabled_awards));
      } else {
        // Default: enable all except sensitive
        const defaultEnabled = AWARDS
          .filter(a => !SENSITIVE_AWARDS.includes(a.id))
          .map(a => a.id);
        setEnabledAwards(new Set(defaultEnabled));
      }
      
      setThankYouMessage(eventData.thank_you_message || '');
    }
    
    // Get current award assignments
    const { data: couples } = await supabase
      .from('couples')
      .select('id')
      .eq('event_id', eventId);
    
    if (couples && couples.length > 0) {
      const coupleIds = couples.map(c => c.id);
      
      const { data: assignmentData } = await supabase
        .from('award_assignments')
        .select('*, couples(invited_name, partner_name)')
        .in('couple_id', coupleIds);
      
      if (assignmentData) {
        setAssignments(assignmentData);
      }
    }
    
    setLoading(false);
  }
  
  function toggleAward(awardId: string) {
    const newEnabled = new Set(enabledAwards);
    if (newEnabled.has(awardId)) {
      newEnabled.delete(awardId);
    } else {
      newEnabled.add(awardId);
    }
    setEnabledAwards(newEnabled);
  }
  
  function enableAll() {
    setEnabledAwards(new Set(AWARDS.map(a => a.id)));
  }
  
  function enableSafeOnly() {
    const safeAwards = AWARDS
      .filter(a => !SENSITIVE_AWARDS.includes(a.id))
      .map(a => a.id);
    setEnabledAwards(new Set(safeAwards));
  }
  
  function disableAll() {
    setEnabledAwards(new Set());
  }
  
  async function saveSettings() {
    if (!event) return;
    
    setSaving(true);
    
    const { error } = await supabase
      .from('events')
      .update({
        enabled_awards: Array.from(enabledAwards),
        thank_you_message: thankYouMessage || null,
      })
      .eq('id', eventId);
    
    if (error) {
      alert('Kunde inte spara: ' + error.message);
    } else {
      alert('✅ Inställningar sparade!');
    }
    
    setSaving(false);
  }
  
  async function recalculateAwards() {
    if (!confirm('Detta kommer att beräkna om alla awards baserat på deltagardata och ersätta befintliga tilldelningar. Fortsätt?')) {
      return;
    }
    
    setSaving(true);
    
    try {
      const response = await fetch('/api/admin/calculate-awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert('❌ Fel: ' + (result.error || 'Okänt fel'));
      } else {
        alert(`✅ ${result.message}\n\nKlicka OK för att ladda om listan.`);
        // Reload assignments
        await loadData();
        setActiveTab('assignments');
      }
    } catch (error) {
      alert('❌ Nätverksfel: ' + (error as Error).message);
    }
    
    setSaving(false);
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse">Laddar...</div>
      </div>
    );
  }
  
  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Event hittades inte</p>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <Link href={`/admin/${eventId}`} className="text-blue-600 hover:underline text-sm">
            ← Tillbaka till admin
          </Link>
          <h1 className="text-2xl font-bold mt-2">🏆 Awards-inställningar</h1>
          <p className="text-gray-600">{event.name}</p>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto flex">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 font-medium ${activeTab === 'settings' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          >
            ⚙️ Inställningar
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`px-6 py-3 font-medium ${activeTab === 'assignments' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          >
            👥 Tilldelning ({assignments.length})
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-3 font-medium ${activeTab === 'preview' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          >
            👀 Preview
          </button>
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto p-4">
        
        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            
            {/* Quick actions */}
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">Snabbval</h2>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={enableAll}
                  className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                >
                  ✅ Aktivera alla
                </button>
                <button
                  onClick={enableSafeOnly}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                >
                  🛡️ Endast säkra
                </button>
                <button
                  onClick={disableAll}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  ❌ Inaktivera alla
                </button>
              </div>
            </div>
            
            {/* Awards grid */}
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">Tillgängliga Awards</h2>
              <p className="text-sm text-gray-500 mb-4">
                ⚠️ Markerade med röd kant är potentiellt känsliga (ålder, hälsa, etc.)
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {AWARDS.map(award => {
                  const isEnabled = enabledAwards.has(award.id);
                  const isSensitive = SENSITIVE_AWARDS.includes(award.id);
                  
                  return (
                    <div
                      key={award.id}
                      onClick={() => toggleAward(award.id)}
                      className={`
                        p-4 rounded-lg border-2 cursor-pointer transition-all
                        ${isEnabled 
                          ? 'bg-green-50 border-green-400' 
                          : 'bg-gray-50 border-gray-200 opacity-60'
                        }
                        ${isSensitive && !isEnabled ? 'border-red-300' : ''}
                        ${isSensitive && isEnabled ? 'border-orange-400' : ''}
                        hover:shadow-md
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{award.emoji}</span>
                        <div className="flex-1">
                          <div className="font-bold flex items-center gap-2">
                            {award.title}
                            {isSensitive && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                ⚠️ Känslig
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">{award.subtitle}</div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                          ${isEnabled ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}
                        `}>
                          {isEnabled && '✓'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <p className="text-sm text-gray-500 mt-4">
                {enabledAwards.size} av {AWARDS.length} awards aktiverade
              </p>
            </div>
            
            {/* Thank you message */}
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">💬 Tack-meddelande</h2>
              <p className="text-sm text-gray-500 mb-3">
                Visas efter award-reveal och i share-steget.
              </p>
              <textarea
                value={thankYouMessage}
                onChange={(e) => setThankYouMessage(e.target.value)}
                placeholder="Tack för en fantastisk kväll! Vi ses nästa år! 🎉"
                className="w-full p-3 border rounded-lg h-32 resize-none"
              />
              <p className="text-xs text-gray-400 mt-2">
                Tips: Använd emojis för att göra meddelandet mer personligt! 🚴✨🎉
              </p>
            </div>
            
            {/* Save button */}
            <div className="flex gap-3">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Sparar...' : '💾 Spara inställningar'}
              </button>
              <button
                onClick={recalculateAwards}
                disabled={saving}
                className="px-6 bg-purple-100 text-purple-700 py-3 rounded-lg font-bold hover:bg-purple-200 disabled:opacity-50"
              >
                🔄 Beräkna awards
              </button>
            </div>
          </div>
        )}
        
        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">Tilldelade Awards</h2>
              
              {assignments.length === 0 ? (
                <p className="text-gray-500 py-8 text-center">
                  Inga awards tilldelade ännu.
                  <br />
                  <span className="text-sm">Använd "Beräkna awards" i Inställningar-fliken.</span>
                </p>
              ) : (
                <div className="space-y-2">
                  {assignments.map(assignment => {
                    const award = AWARDS.find(a => a.id === assignment.award_id);
                    const personName = assignment.person_type === 'partner' 
                      ? assignment.couples?.partner_name 
                      : assignment.couples?.invited_name;
                    
                    return (
                      <div 
                        key={assignment.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <span className="text-2xl">{award?.emoji || '🎁'}</span>
                        <div className="flex-1">
                          <div className="font-medium">{personName}</div>
                          <div className="text-sm text-gray-600">
                            {award?.title || assignment.award_id}
                            {assignment.value && ` — ${assignment.value}`}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {assignment.person_type}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Preview Tab */}
        {activeTab === 'preview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-bold mb-3">Preview Awards</h2>
              <p className="text-sm text-gray-500 mb-4">
                Så här ser varje aktiverad award ut för deltagarna.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {AWARDS.filter(a => enabledAwards.has(a.id)).map(award => (
                  <div
                    key={award.id}
                    className={`p-6 rounded-xl text-white text-center bg-gradient-to-br ${award.color_from} ${award.color_to}`}
                  >
                    <div className="text-5xl mb-3">{award.emoji}</div>
                    <div className="text-xl font-bold mb-1">"{award.title}"</div>
                    <div className="text-sm opacity-90">{award.subtitle}</div>
                  </div>
                ))}
              </div>
              
              {thankYouMessage && (
                <div className="mt-6 p-4 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg text-white">
                  <p className="text-sm opacity-80 mb-2">Tack-meddelande:</p>
                  <p className="text-lg font-medium">{thankYouMessage}</p>
                </div>
              )}
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}
