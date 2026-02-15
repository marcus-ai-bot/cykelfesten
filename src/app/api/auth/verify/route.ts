import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// GET /api/auth/verify?token=xxx
// Verify magic link, create session, set cookie, show success page

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
  }
  
  const supabase = createAdminClient();
  
  // Find token (allow both unused AND recently-used tokens for link preview resilience)
  const { data: tokenData, error: tokenError } = await supabase
    .from('magic_link_tokens')
    .select('*, organizer:organizers(*)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (tokenError || !tokenData) {
    console.error('Token not found or expired:', tokenError?.message);
    return NextResponse.redirect(new URL('/login?error=expired_token', request.url));
  }
  
  // If token was already used, check if there's an existing valid session
  if (tokenData.used_at) {
    const { data: existingSession } = await supabase
      .from('organizer_sessions')
      .select('session_token, expires_at')
      .eq('organizer_id', tokenData.organizer_id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (existingSession) {
      // Reuse existing session
      console.log('Reusing existing session for organizer:', tokenData.organizer_id);
      return buildSuccessResponse(tokenData, existingSession.session_token, request);
    }
    
    // Token was used but no session exists (link preview ate it) — create new session anyway
    console.log('Token used but no session found — creating new session (link preview recovery)');
  } else {
    // Mark token as used
    await supabase
      .from('magic_link_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token);
  }
  
  // Update last login
  await supabase
    .from('organizers')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', tokenData.organizer_id);
  
  // Create session token
  const sessionToken = randomBytes(32).toString('hex');
  const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  // Delete any existing sessions for this organizer
  await supabase
    .from('organizer_sessions')
    .delete()
    .eq('organizer_id', tokenData.organizer_id);
  
  // Store new session
  const { error: sessionError } = await supabase
    .from('organizer_sessions')
    .insert({
      organizer_id: tokenData.organizer_id,
      session_token: sessionToken,
      expires_at: sessionExpires.toISOString(),
    });
  
  if (sessionError) {
    console.error('SESSION INSERT FAILED:', sessionError);
    return NextResponse.json({ 
      error: 'Failed to create session', 
      details: sessionError.message,
    }, { status: 500 });
  }
  
  console.log('SESSION CREATED for organizer:', tokenData.organizer_id);
  
  return buildSuccessResponse(tokenData, sessionToken, request);
}

function buildSuccessResponse(tokenData: any, sessionToken: string, request: NextRequest) {
  const organizer = tokenData.organizer as any;
  const redirectPath = organizer?.name ? '/organizer' : '/organizer/onboarding';
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  
  // Use a standard redirect with Set-Cookie header
  // The browser processes Set-Cookie BEFORE following the redirect
  const redirectUrl = new URL(redirectPath, request.url);
  const response = NextResponse.redirect(redirectUrl);
  
  // Set cookie on the redirect response — browser stores it before following redirect
  response.cookies.set('organizer_session', sessionToken, {
    path: '/',
    maxAge,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  
  return response;
}
