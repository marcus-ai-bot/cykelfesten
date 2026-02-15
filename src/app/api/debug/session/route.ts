import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';

// GET /api/debug/session
// Debug endpoint to see what's happening with sessions

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const sessionToken = cookieStore.get('organizer_session')?.value;
  
  const debug: any = {
    timestamp: new Date().toISOString(),
    cookies_count: allCookies.length,
    cookie_names: allCookies.map(c => c.name),
    session_token_exists: !!sessionToken,
    session_token_preview: sessionToken ? sessionToken.substring(0, 10) + '...' : null,
  };
  
  if (sessionToken) {
    const supabase = createAdminClient();
    
    // Check if session exists in DB
    const { data: session, error: sessionError } = await supabase
      .from('organizer_sessions')
      .select('*')
      .eq('session_token', sessionToken)
      .single();
    
    debug.session_in_db = !!session;
    debug.session_error = sessionError?.message || null;
    
    if (session) {
      debug.session_expires_at = session.expires_at;
      debug.session_expired = new Date(session.expires_at) < new Date();
      debug.organizer_id = session.organizer_id;
      
      // Get organizer
      const { data: organizer } = await supabase
        .from('organizers')
        .select('id, email, name')
        .eq('id', session.organizer_id)
        .single();
      
      debug.organizer = organizer;
    }
  }
  
  return NextResponse.json(debug, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
