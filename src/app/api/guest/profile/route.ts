import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';

// GET /api/guest/profile?slug=xxx
// Returns couple profile data for the logged-in guest
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = cookieStore.get('guest_session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(session);
  if (!payload || payload.type !== 'guest') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guestEmail = payload.email.toLowerCase().trim();
  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from('events_public')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
  }

  const { data: couple } = await supabase
    .from('couples')
    .select('*')
    .eq('event_id', event.id)
    .eq('cancelled', false)
    .or(`invited_email.eq.${guestEmail},partner_email.eq.${guestEmail}`)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Inget par kopplat till din email' }, { status: 404 });
  }

  return NextResponse.json({ event, couple });
}

// POST /api/guest/profile?slug=xxx
// Updates couple profile data for the logged-in guest
export async function POST(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = cookieStore.get('guest_session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(session);
  if (!payload || payload.type !== 'guest') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guestEmail = payload.email.toLowerCase().trim();
  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from('events_public')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
  }

  const { data: couple } = await supabase
    .from('couples')
    .select('id')
    .eq('event_id', event.id)
    .eq('cancelled', false)
    .or(`invited_email.eq.${guestEmail},partner_email.eq.${guestEmail}`)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 404 });
  }

  const body = await request.json();
  
  // Only allow updating safe fields
  const allowedFields = [
    'invited_allergies', 'invited_allergy_notes', 'invited_birth_year',
    'invited_instagram', 'invited_fun_facts',
    'partner_allergies', 'partner_allergy_notes', 'partner_birth_year',
    'partner_instagram', 'partner_fun_facts',
    'address', 'latitude', 'longitude',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('couples')
    .update(updates)
    .eq('id', couple.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
