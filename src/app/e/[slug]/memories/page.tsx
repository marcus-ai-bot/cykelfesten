'use client';

/**
 * Memories Page
 * 
 * Post-event page showing:
 * - Event statistics
 * - All host messages
 * - Instagram handles of participants
 * - Personal stats (per authenticated couple)
 * 
 * Security: Uses API layer with token validation
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface MemoriesData {
  event_name: string;
  event_date: string;
  total_couples: number;
  total_distance_km: number;
  total_dishes: number;
  host_messages: HostMessage[];
  participants: Participant[];
  personal_stats: PersonalStats | null;
}

interface HostMessage {
  host_names: string;
  course: string;
  message: string;
}

interface Participant {
  name: string;
  instagram: string | null;
}

interface PersonalStats {
  couple_name: string;
  distance_cycled_km: number;
  people_met: number;
  courses_eaten: number;
}

export default function MemoriesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const token = searchParams.get('token');
  
  const [data, setData] = useState<MemoriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'messages' | 'people'>('stats');
  
  useEffect(() => {
    loadData();
  }, [slug, token]);
  
  async function loadData() {
    if (!token) {
      setError('Saknar åtkomsttoken');
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch(
        `/api/memories/data?eventSlug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`
      );
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Kunde inte ladda minnen');
      }
      
      const memoriesData = await response.json();
      setData(memoriesData);
    } catch (err: any) {
      console.error('Failed to load memories:', err);
      setError(err.message || 'Något gick fel');
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-100 via-pink-100 to-purple-100 flex items-center justify-center">
        <div className="animate-pulse text-purple-600 text-xl">Laddar minnen...</div>
      </div>
    );
  }
  
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-xl mb-4">😕 {error || 'Event hittades inte'}</p>
          <Link href="/" className="text-purple-600 underline">Tillbaka</Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-100 via-pink-100 to-purple-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 pb-12">
        <div className="max-w-lg mx-auto text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-5xl mb-3"
          >
            ✨
          </motion.div>
          <h1 className="text-3xl font-bold mb-2">{data.event_name}</h1>
          <p className="text-purple-200">Minnen från {new Date(data.event_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
      
      {/* Personal stats card (if available) */}
      {data.personal_stats && (
        <div className="max-w-lg mx-auto px-4 -mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              🚴 {data.personal_stats.couple_name}
            </h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-purple-600">{data.personal_stats.distance_cycled_km}</p>
                <p className="text-xs text-gray-500">km cyklat</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-pink-600">{data.personal_stats.people_met}</p>
                <p className="text-xs text-gray-500">nya vänner</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-orange-500">{data.personal_stats.courses_eaten}</p>
                <p className="text-xs text-gray-500">rätter</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Tabs */}
      <div className="max-w-lg mx-auto px-4 mt-6">
        <div className="flex bg-white/50 rounded-xl p-1 mb-4">
          {[
            { id: 'stats', label: '📊 Statistik' },
            { id: 'messages', label: '💌 Hälsningar' },
            { id: 'people', label: '👥 Deltagare' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-white text-purple-700 shadow' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 pb-8"
        >
          {activeTab === 'stats' && (
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h3 className="font-semibold text-gray-700 mb-4">Kvällens statistik</h3>
              <div className="grid grid-cols-2 gap-4">
                <StatCard emoji="👥" value={data.total_couples} label="par deltog" />
                <StatCard emoji="🚴" value={data.total_distance_km} label="km cyklades" />
                <StatCard emoji="🍽️" value={data.total_dishes} label="rätter serverades" />
                <StatCard emoji="🏠" value={data.total_couples} label="hem besöktes" />
              </div>
            </div>
          )}
          
          {activeTab === 'messages' && (
            <div className="space-y-4">
              {data.host_messages.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 shadow-lg text-center text-gray-500">
                  <p className="text-4xl mb-3">💌</p>
                  <p>Inga hälsningar ännu...</p>
                  <p className="text-sm">Värdarna skriver sina minnen!</p>
                </div>
              ) : (
                data.host_messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white rounded-2xl p-5 shadow-lg"
                  >
                    <p className="font-medium text-purple-600 mb-2">{msg.host_names}</p>
                    <p className="text-gray-700 whitespace-pre-line">{msg.message}</p>
                  </motion.div>
                ))
              )}
            </div>
          )}
          
          {activeTab === 'people' && (
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <h3 className="font-semibold text-gray-700 mb-4">Kvällens deltagare</h3>
              <div className="space-y-3">
                {data.participants.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-gray-800">{p.name}</span>
                    {p.instagram ? (
                      <a
                        href={`https://instagram.com/${p.instagram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-pink-500 hover:text-pink-600 text-sm"
                      >
                        @{p.instagram.replace('@', '')}
                      </a>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <div className="bg-purple-50 rounded-xl p-4 text-center">
      <p className="text-2xl mb-1">{emoji}</p>
      <p className="text-2xl font-bold text-purple-700">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
