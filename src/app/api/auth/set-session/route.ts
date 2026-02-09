import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/auth/set-session?token=xxx&redirect=/organizer
// Sets session cookie and redirects - uses GET for reliable cookie setting

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const redirect = request.nextUrl.searchParams.get('redirect') || '/organizer';
  
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=no_token', request.url));
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
    return NextResponse.redirect(new URL('/login?error=invalid_session', request.url));
  }
  
  // Create redirect response with Set-Cookie header
  const maxAge = 7 * 24 * 60 * 60;
  const cookieValue = `organizer_session=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
  
  const redirectUrl = new URL(redirect, request.url);
  
  return new NextResponse(null, {
    status: 302,
    headers: {
      'Location': redirectUrl.toString(),
      'Set-Cookie': cookieValue,
    },
  });
}
