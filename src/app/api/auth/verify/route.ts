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
  
  // Return HTML page that calls API to set cookie, then redirects
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Loggar in...</title>
      </head>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🚴</div>
          <p id="status">Loggar in...</p>
        </div>
        <script>
          (async function() {
            try {
              // Call API to set cookie (same-origin request)
              const res = await fetch('/api/auth/set-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: '${sessionToken}' }),
                credentials: 'include'
              });
              
              if (res.ok) {
                document.getElementById('status').textContent = 'Inloggad! Redirectar...';
                window.location.href = '${redirectPath}';
              } else {
                document.getElementById('status').textContent = 'Fel: ' + res.status;
              }
            } catch (err) {
              document.getElementById('status').textContent = 'Fel: ' + err.message;
            }
          })();
        </script>
      </body>
    </html>
  `;
  
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
