import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';

// GET /api/debug/auth — shows auth state without modifying anything
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('organizer_session')?.value;
  
  const allCookies = cookieStore.getAll().map(c => ({ name: c.name, valueLen: c.value.length }));
  
  const supabase = createAdminClient();
  
  // Count sessions in DB
  const { data: sessions, error: sessErr } = await supabase
    .from('organizer_sessions')
    .select('id, organizer_id, session_token, expires_at, created_at');
  
  let sessionMatch = null;
  if (sessionToken) {
    const { data, error } = await supabase
      .from('organizer_sessions')
      .select('*')
      .eq('session_token', sessionToken)
      .single();
    sessionMatch = { data, error: error?.message };
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    cookie_exists: !!sessionToken,
    cookie_value_prefix: sessionToken ? sessionToken.substring(0, 15) + '...' : null,
    all_cookies: allCookies,
    sessions_in_db: sessions?.length ?? 0,
    sessions: sessions?.map(s => ({
      id: s.id,
      organizer_id: s.organizer_id.substring(0, 8),
      token_prefix: s.session_token.substring(0, 15),
      expires_at: s.expires_at,
      created_at: s.created_at,
    })),
    session_lookup: sessionMatch,
    db_error: sessErr?.message,
  });
}
