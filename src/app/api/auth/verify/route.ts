import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// GET /api/auth/verify?token=xxx
// Verify magic link, create session, set cookie, show success page

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
  
  // Build cookie - use proper attributes for production
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  
  // Return HTML page with cookie set via response.cookies (proper Next.js way)
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Inloggad!</title>
      </head>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <div style="background: white; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
          <div style="font-size: 64px; margin-bottom: 16px;">✅</div>
          <h1 style="margin: 0 0 8px 0; color: #1a1a1a;">Inloggad!</h1>
          <p style="color: #666; margin-bottom: 24px;">Välkommen${organizer.name ? ' ' + organizer.name : ''}!</p>
          <a href="${redirectPath}" style="display: inline-block; background: #4f46e5; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
            Gå till Dashboard →
          </a>
        </div>
      </body>
    </html>
  `;
  
  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
  
  // Set cookie using Next.js proper method
  response.cookies.set('organizer_session', sessionToken, {
    path: '/',
    maxAge,
    httpOnly: true,
    secure: true, // Required for HTTPS on Vercel
    sameSite: 'lax',
  });
  
  return response;
}
