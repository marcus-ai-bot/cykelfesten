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
  
  // Return HTML page with cookie set, user clicks to continue
  const maxAge = 7 * 24 * 60 * 60;
  const cookieValue = `organizer_session=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Inloggad!</title></head>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <div style="background: white; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
          <div style="font-size: 64px; margin-bottom: 16px;">✅</div>
          <h1 style="margin: 0 0 8px 0; color: #1a1a1a;">Inloggad!</h1>
          <p style="color: #666; margin-bottom: 24px;">Klicka för att fortsätta</p>
          <a href="${redirect}" style="display: inline-block; background: #4f46e5; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
            Gå till Dashboard →
          </a>
        </div>
      </body>
    </html>
  `;
  
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Set-Cookie': cookieValue,
    },
  });
}
