import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { signToken, verifyToken } from '@/lib/tokens';
import { checkRateLimit, getClientIp, AUTH_RATE_LIMIT } from '@/lib/rate-limit';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://cykelfesten.vercel.app';

// POST /api/auth/guest-magic-link
// Send magic link to invited guest
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(request);

    const ipLimit = checkRateLimit(clientIp, AUTH_RATE_LIMIT.byIp);
    if (!ipLimit.success) {
      return NextResponse.json(
        { error: 'För många försök. Vänta några minuter.', retryAfter: ipLimit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } }
      );
    }

    const emailLimit = checkRateLimit(normalizedEmail, AUTH_RATE_LIMIT.byEmail);
    if (!emailLimit.success) {
      return NextResponse.json(
        { error: 'För många försök för denna email. Vänta några minuter.', retryAfter: emailLimit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfterSeconds) } }
      );
    }

    const supabase = createAdminClient();
    const { data: couples } = await supabase
      .from('couples')
      .select('id')
      .or(`invited_email.eq.${normalizedEmail},partner_email.eq.${normalizedEmail}`)
      .limit(1);

    if (!couples || couples.length === 0) {
      return NextResponse.json(
        { error: 'Hittade ingen inbjudan för den e-postadressen.' },
        { status: 404 }
      );
    }

    const token = signToken({ email: normalizedEmail, type: 'guest' });
    const loginUrl = `${BASE_URL}/api/auth/guest-magic-link?token=${token}`;

    const { error: emailError } = await sendEmail({
      to: normalizedEmail,
      subject: '✨ Din länk till Cykelfesten',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #d97706;">🚴 Cykelfesten</h1>
          <p>Hej!</p>
          <p>Klicka på knappen nedan för att se dina event och kuvert:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 14px 26px; border-radius: 999px; text-decoration: none; font-weight: bold;">
              Öppna gästportalen →
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">Länken är giltig i 7 dagar.</p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Guest magic link email error:', emailError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Magic link sent' });
  } catch (error) {
    console.error('Guest magic link error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/auth/guest-magic-link?token=xxx
// Verify magic link, set guest session cookie
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/guest?error=invalid_token', request.url));
  }

  const payload = verifyToken(token);
  if (!payload || payload.type !== 'guest') {
    return NextResponse.redirect(new URL('/guest?error=invalid_token', request.url));
  }

  const response = NextResponse.redirect(new URL('/guest', request.url));
  response.cookies.set('guest_session', token, {
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });

  return response;
}
