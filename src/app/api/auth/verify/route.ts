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
          // Set cookie (without HttpOnly so JS can set it)
          document.cookie = "organizer_session=${sessionToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax; Secure";
          
          // Verify cookie was set
          var cookieSet = document.cookie.includes('organizer_session');
          console.log('Cookie set via JS:', cookieSet);
          document.getElementById('status').textContent = cookieSet ? 'Cookie OK, redirecting...' : 'Cookie failed!';
          
          // Redirect after short delay
          setTimeout(function() {
            window.location.href = "${redirectPath}";
          }, 1000);
        </script>
      </body>
    </html>
  `;
  
  // Create response with multiple Set-Cookie attempts
  const response = new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
  
  // Set cookie using response.cookies
  // Note: NOT httpOnly so JavaScript can also set it as backup
  response.cookies.set({
    name: 'organizer_session',
    value: sessionToken,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    sameSite: 'lax',
    secure: true,
    httpOnly: false, // Allow JS to read/set as backup
  });
  
  return response;
}
