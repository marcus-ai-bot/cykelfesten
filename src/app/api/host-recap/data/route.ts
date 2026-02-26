/**
 * Host Recap Data API
 * 
 * GET /api/host-recap/data?eventSlug=xxx&token=yyy
 * 
 * Returns host recap data (couple info, existing recap if any).
 * Only accessible by the couple's own token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAccessFromParams } from '@/lib/tokens';

interface RecapData {
  couple_name: string;
  event_name: string;
  existing_recap: {
    last_guest_left: string;
    three_words: string;
    funniest_moment: string;
    unexpected: string;
    custom_message: string;
    generated_message: string;
    submitted_at: string;
  } | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const eventSlug = searchParams.get('eventSlug');
  const supabase = createAdminClient();
  
  // Validate token
  const access = getAccessFromParams(searchParams);
  
  if (!eventSlug || !access) {
    return NextResponse.json(
      { error: 'Missing eventSlug or valid token' },
      { status: 400 }
    );
  }
  
  const { coupleId } = access;
  
  try {
    // 1. Get couple with event
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, events(id, name, slug)')
      .eq('id', coupleId)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
    }
    
    // Verify event slug matches
    if ((couple.events as any)?.slug !== eventSlug) {
      return NextResponse.json({ error: 'Event mismatch' }, { status: 403 });
    }
    
    const coupleName = `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`;
    const eventName = (couple.events as any)?.name || '';
    
    // 2. Get existing recap if any
    const { data: recap } = await supabase
      .from('host_recaps')
      .select('*')
      .eq('couple_id', coupleId)
      .maybeSingle();
    
    const data: RecapData = {
      couple_name: coupleName,
      event_name: eventName,
      existing_recap: recap ? {
        last_guest_left: recap.last_guest_left || '',
        three_words: recap.three_words || '',
        funniest_moment: recap.funniest_moment || '',
        unexpected: recap.unexpected || '',
        custom_message: recap.custom_message || '',
        generated_message: recap.generated_message || '',
        submitted_at: recap.submitted_at || '',
      } : null,
    };
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Host recap data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
