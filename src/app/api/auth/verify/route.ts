import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// GET /api/auth/verify?token=xxx
// Verify magic link and create session

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
  }
  
  const supabase = await createClient();
  
  // Find and validate token
  const { data: tokenData, error: tokenError } = await supabase
    .from('magic_link_tokens')
    .select('*, organizer:organizers(*)')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (tokenError || !tokenData) {
    return NextResponse.redirect(new URL('/login?error=expired_token', request.url));
  }
  
  // Mark token as used
  await supabase
    .from('magic_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);
  
  // Update last login
  await supabase
    .from('organizers')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', tokenData.organizer_id);
  
  // Create session token
  const sessionToken = randomBytes(32).toString('hex');
  const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  // Store session
  await supabase
    .from('organizer_sessions')
    .insert({
      organizer_id: tokenData.organizer_id,
      session_token: sessionToken,
      expires_at: sessionExpires.toISOString(),
    });
  
  // Determine redirect URL
  const organizer = tokenData.organizer as any;
  const redirectPath = organizer.name ? '/organizer' : '/organizer/onboarding';
  
  // Redirect to set-session endpoint which will set cookie and redirect
  const setSessionUrl = new URL('/api/auth/set-session', request.url);
  setSessionUrl.searchParams.set('token', sessionToken);
  setSessionUrl.searchParams.set('redirect', redirectPath);
  
  return NextResponse.redirect(setSessionUrl);
}
