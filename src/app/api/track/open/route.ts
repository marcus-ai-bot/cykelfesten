import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';

// GET /api/track/open?coupleId=xxx&person=invited&redirect=/e/demo/wrap
// Tracks link opens and redirects to the actual page
// Used in email links for analytics

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coupleId = searchParams.get('coupleId');
    const person = searchParams.get('person');
    const redirect = searchParams.get('redirect');
    
    if (!coupleId || !person || !redirect) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    // Get client info for tracking
    const userAgent = request.headers.get('user-agent') || null;
    const referrer = request.headers.get('referer') || null;
    
    // Hash IP for privacy (we don't store raw IPs)
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    const ipHash = crypto.createHash('sha256').update(ip + process.env.IP_SALT || 'cykelfesten').digest('hex').slice(0, 16);
    
    // Log the open using service client (bypasses RLS)
    const supabase = createServiceClient();
    
    await supabase.from('wrap_link_opens').insert({
      couple_id: coupleId,
      person_type: person,
      user_agent: userAgent,
      ip_hash: ipHash,
      referrer,
    });
    
    // Redirect to the actual page
    const redirectUrl = new URL(redirect, request.url);
    redirectUrl.searchParams.set('coupleId', coupleId);
    redirectUrl.searchParams.set('person', person);
    
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error tracking open:', error);
    // Still redirect even if tracking fails
    const redirect = request.nextUrl.searchParams.get('redirect') || '/';
    return NextResponse.redirect(new URL(redirect, request.url));
  }
}
