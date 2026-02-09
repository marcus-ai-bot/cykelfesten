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
  
  // Return HTML page that sets cookie via JavaScript and redirects
  // This is more reliable than setting cookie on redirect response
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Loggar in...</title>
        <meta http-equiv="refresh" content="2;url=${redirectPath}">
      </head>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🚴</div>
          <p>Loggar in...</p>
        </div>
        <script>
          document.cookie = "organizer_session=${sessionToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax; Secure";
          setTimeout(function() {
            window.location.href = "${redirectPath}";
          }, 500);
        </script>
      </body>
    </html>
  `;
  
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Set-Cookie': `organizer_session=${sessionToken}; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax; Secure; HttpOnly`,
    },
  });
}
