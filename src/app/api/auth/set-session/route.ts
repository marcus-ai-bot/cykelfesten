import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/auth/set-session
// Sets session cookie - called from same origin after verify

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // Verify token exists in database
    const { data: session, error } = await supabase
      .from('organizer_sessions')
      .select('id, expires_at')
      .eq('session_token', token)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    
    // Create response with Set-Cookie header directly
    // Note: Removed HttpOnly for now to debug
    const maxAge = 7 * 24 * 60 * 60;
    const cookieValue = `organizer_session=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
    
    return new NextResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieValue,
      },
    });
    
  } catch (error) {
    console.error('Set session error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
