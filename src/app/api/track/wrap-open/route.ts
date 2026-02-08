import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';

// POST /api/track/wrap-open
// Logs when a participant opens their wrap page
// Called from client-side, fire-and-forget

export async function POST(request: NextRequest) {
  try {
    const { coupleId, personType } = await request.json();
    
    if (!coupleId || !personType) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    
    // Get client info
    const userAgent = request.headers.get('user-agent') || null;
    const referrer = request.headers.get('referer') || null;
    
    // Hash IP for privacy
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    const ipHash = crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'cykelfesten')).digest('hex').slice(0, 16);
    
    // Log using service client (bypasses RLS)
    const supabase = createServiceClient();
    
    await supabase.from('wrap_link_opens').insert({
      couple_id: coupleId,
      person_type: personType,
      user_agent: userAgent,
      ip_hash: ipHash,
      referrer,
    });
    
    return NextResponse.json({ ok: true });
    
  } catch (error) {
    // Fail silently - tracking shouldn't break the app
    console.error('Track error:', error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
