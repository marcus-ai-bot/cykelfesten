import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('organizer_session')?.value;
  
  // Delete session from DB if exists
  if (sessionToken) {
    const supabase = createAdminClient();
    await supabase
      .from('organizer_sessions')
      .delete()
      .eq('session_token', sessionToken);
  }
  
  // Redirect to login
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url);
  
  // Clear the cookie properly
  response.cookies.set('organizer_session', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  
  return response;
}
