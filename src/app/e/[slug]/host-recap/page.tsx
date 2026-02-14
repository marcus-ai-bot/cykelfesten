'use client';

/**
 * Host Recap Page
 * 
 * For hosts to fill in after the party:
 * - Quick questions about the evening
 * - AI generates a thank-you message
 * - Host adjusts and approves
 * 
 * Security: Uses API layer with token validation
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface RecapData {
  last_guest_left: string;
  three_words: string;
  funniest_moment: string;
  unexpected: string;
  message_to_guests: string;
}

const INITIAL_DATA: RecapData = {
  last_guest_left: '',
  three_words: '',
  funniest_moment: '',
  unexpected: '',
  message_to_guests: '',
};

export default function HostRecapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const token = searchParams.get('token');
  
  const [step, setStep] = useState<'loading' | 'questions' | 'preview' | 'done'>('loading');
  const [data, setData] = useState<RecapData>(INITIAL_DATA);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [coupleName, setCoupleName] = useState('');
  
  useEffect(() => {
    loadCoupleInfo();
  }, [token, slug]);
  
  async function loadCoupleInfo() {
    if (!token) {
      setError('Saknar åtkomsttoken');
      setStep('questions');
      return;
    }
    
    try {
      const response = await fetch(
        `/api/host-recap/data?eventSlug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`
      );
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Kunde inte ladda data');
      }
      
      const recapData = await response.json();
      setCoupleName(recapData.couple_name);
      setEventName(recapData.event_name);
      
      // If already submitted, show done state
      if (recapData.existing_recap?.submitted_at) {
        setGeneratedMessage(recapData.existing_recap.generated_message);
        setStep('done');
      } else {
        setStep('questions');
      }
    } catch (err: any) {
      console.error('Failed to load recap data:', err);
      setError(err.message);
      setStep('questions');
    }
  }
  
  function generateMessage() {
    // Simple template-based generation (in production, use AI)
    const timeText = data.last_guest_left ? `Sista gästen gick ${data.last_guest_left}` : '';
    const wordsText = data.three_words ? `En ${data.three_words.toLowerCase()} kväll` : 'En fantastisk kväll';
    const funnyText = data.funniest_moment ? `Vi skrattade så vi grät när ${data.funniest_moment.toLowerCase()}` : '';
    const unexpectedText = data.unexpected ? `Överraskningen var när ${data.unexpected.toLowerCase()}` : '';
    const customText = data.message_to_guests || '';
    
    const parts = [
      `Tack för ${wordsText.toLowerCase()}! ✨`,
      funnyText ? `${funnyText}. 😂` : '',
      unexpectedText ? `${unexpectedText}!` : '',
      timeText ? `${timeText} — vi hade gärna haft er kvar längre!` : '',
      customText ? `\n\n${customText}` : '',
      `\n\nKram från ${coupleName} 💛`,
    ].filter(Boolean);
    
    setGeneratedMessage(parts.join(' '));
  }
  
  async function handleSubmit() {
    if (!token) {
      setError('Saknar åtkomsttoken');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/host-recap/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventSlug: slug,
          token,
          data: {
            ...data,
            generated_message: generatedMessage,
          },
        }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Kunde inte spara');
      }
      
      setStep('done');
    } catch (err: any) {
      console.error('Failed to submit recap:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  
  function handleNext() {
    generateMessage();
    setStep('preview');
  }
  
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="animate-pulse text-amber-600 text-xl">Laddar...</div>
      </div>
    );
  }
  
  if (error && step !== 'questions') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-xl mb-4">😕 {error}</p>
          <Link href="/" className="text-amber-600 underline">Tillbaka</Link>
        </div>
      </div>
    );
  }
  
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center text-white"
        >
          <motion.div
            initial={{ rotate: -180, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
            className="text-8xl mb-6"
          >
            💚
          </motion.div>
          <h1 className="text-3xl font-bold mb-4">Tack!</h1>
          <p className="text-green-100 mb-8">
            Ditt meddelande skickas till gästerna imorgon kl 10:00
          </p>
          <Link
            href={`/e/${slug}`}
            className="inline-block bg-white/20 hover:bg-white/30 px-6 py-3 rounded-xl font-medium transition-colors"
          >
            Tillbaka till eventet
          </Link>
        </motion.div>
      </div>
    );
  }
  
  if (step === 'preview') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-4">
        <div className="max-w-lg mx-auto pt-8 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Förhandsgranska ditt meddelande
              </h1>
              <p className="text-gray-600">Justera texten om du vill!</p>
            </div>
            
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">💌</span>
                <span className="font-medium text-gray-700">Till gästerna:</span>
              </div>
              <textarea
                value={generatedMessage}
                onChange={(e) => setGeneratedMessage(e.target.value)}
                className="w-full p-4 border border-amber-200 rounded-xl min-h-[200px] text-gray-800 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
            
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">
                {error}
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => setStep('questions')}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                ← Tillbaka
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                {loading ? 'Sparar...' : '✨ Skicka'}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }
  
  // Questions step
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <div className="max-w-lg mx-auto pt-8 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="text-center">
            <span className="text-5xl">🎊</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-2">
              Hur var kvällen?
            </h1>
            <p className="text-gray-600">
              Dela några minnen — vi skapar ett fint meddelande till gästerna!
            </p>
            {coupleName && (
              <p className="text-amber-600 font-medium mt-2">{coupleName}</p>
            )}
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">
              {error}
            </div>
          )}
          
          {/* Questions */}
          <div className="space-y-4">
            <QuestionCard
              emoji="⏰"
              question="När gick sista gästen?"
              placeholder="23:45"
              value={data.last_guest_left}
              onChange={(v) => setData({ ...data, last_guest_left: v })}
            />
            
            <QuestionCard
              emoji="✨"
              question="Beskriv kvällen i 3 ord"
              placeholder="Magisk, skrattig, överraskande"
              value={data.three_words}
              onChange={(v) => setData({ ...data, three_words: v })}
            />
            
            <QuestionCard
              emoji="😂"
              question="Roligaste ögonblicket?"
              placeholder="När Erik spillde rödvin på kavajen..."
              value={data.funniest_moment}
              onChange={(v) => setData({ ...data, funniest_moment: v })}
              multiline
            />
            
            <QuestionCard
              emoji="🤯"
              question="Något oväntat som hände?"
              placeholder="Ingen visste att Anna kunde jongera!"
              value={data.unexpected}
              onChange={(v) => setData({ ...data, unexpected: v })}
              multiline
            />
            
            <QuestionCard
              emoji="💬"
              question="Något extra du vill säga?"
              placeholder="Tack för att ni kom..."
              value={data.message_to_guests}
              onChange={(v) => setData({ ...data, message_to_guests: v })}
              multiline
              optional
            />
          </div>
          
          {/* Submit */}
          <button
            onClick={handleNext}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 px-6 rounded-xl text-lg shadow-lg transition-colors"
          >
            Nästa → Förhandsgranska
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function QuestionCard({
  emoji,
  question,
  placeholder,
  value,
  onChange,
  multiline = false,
  optional = false,
}: {
  emoji: string;
  question: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{emoji}</span>
        <label className="font-medium text-gray-700">
          {question}
          {optional && <span className="text-gray-400 text-sm ml-1">(valfri)</span>}
        </label>
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full p-3 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent min-h-[80px]"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full p-3 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
        />
      )}
    </div>
  );
}
