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
  
  // Return HTML page that redirects after Set-Cookie header is processed
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Inloggad!</title>
        <meta http-equiv="refresh" content="1;url=${redirectPath}">
        <script>
          // Redirect immediately — cookie is set via Set-Cookie header
          window.location.href = "${redirectPath}";
        </script>
      </head>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <div style="background: white; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
          <div style="font-size: 64px; margin-bottom: 16px;">✅</div>
          <h1 style="margin: 0 0 8px 0; color: #1a1a1a;">Inloggad!</h1>
          <p style="color: #666;">Skickar dig vidare...</p>
        </div>
      </body>
    </html>
  `;
  
  const response = new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  
  // Also set via header as backup (httpOnly version)
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  response.headers.append(
    'Set-Cookie',
    `organizer_session=${sessionToken}; Path=/; Max-Age=${maxAge}; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`
  );
  
  return response;
}
