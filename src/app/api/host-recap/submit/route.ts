/**
 * Host Recap Submit API
 * 
 * POST /api/host-recap/submit
 * Body: { eventSlug, token, data }
 * 
 * Submits or updates a host recap after validating token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/tokens';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RecapSubmission {
  last_guest_left: string;
  three_words: string;
  funniest_moment: string;
  unexpected: string;
  message_to_guests: string;
  generated_message: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventSlug, token, data } = body as {
      eventSlug: string;
      token: string;
      data: RecapSubmission;
    };
    
    // Validate required fields
    if (!eventSlug || !token || !data) {
      return NextResponse.json(
        { error: 'Missing eventSlug, token, or data' },
        { status: 400 }
      );
    }
    
    // Verify token
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
    
    const { coupleId } = payload;
    
    // Verify couple belongs to this event
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id, events(slug)')
      .eq('id', coupleId)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
    }
    
    if ((couple.events as any)?.slug !== eventSlug) {
      return NextResponse.json({ error: 'Event mismatch' }, { status: 403 });
    }
    
    // Validate data (basic sanitization)
    const sanitizedData = {
      couple_id: coupleId,
      last_guest_left: String(data.last_guest_left || '').slice(0, 20),
      three_words: String(data.three_words || '').slice(0, 100),
      funniest_moment: String(data.funniest_moment || '').slice(0, 500),
      unexpected: String(data.unexpected || '').slice(0, 500),
      custom_message: String(data.message_to_guests || '').slice(0, 1000),
      generated_message: String(data.generated_message || '').slice(0, 2000),
      submitted_at: new Date().toISOString(),
    };
    
    // Upsert the recap
    const { error: upsertError } = await supabase
      .from('host_recaps')
      .upsert(sanitizedData, { onConflict: 'couple_id' });
    
    if (upsertError) {
      console.error('Recap upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save recap' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Host recap submit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
