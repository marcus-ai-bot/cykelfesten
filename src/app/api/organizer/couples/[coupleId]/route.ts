import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';

// GET /api/organizer/couples/[coupleId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: couple, error } = await supabase
    .from('couples')
    .select('*, events(id, name, slug)')
    .eq('id', coupleId)
    .single();

  if (error || !couple) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify organizer has access to this event
  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) {
    return NextResponse.json({ error: 'No access' }, { status: 403 });
  }

  return NextResponse.json({ couple });
}

// PATCH /api/organizer/couples/[coupleId] — update couple fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const supabase = createAdminClient();

  // Get couple + verify access
  const { data: couple } = await supabase
    .from('couples')
    .select('event_id')
    .eq('id', coupleId)
    .single();

  if (!couple) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const updates = await request.json();

  // Whitelist allowed fields
  const allowed = [
    'invited_name', 'invited_email', 'invited_phone', 'invited_allergies',
    'invited_birth_year', 'invited_fun_facts', 'invited_pet_allergy',
    'partner_name', 'partner_email', 'partner_phone', 'partner_allergies',
    'partner_birth_year', 'partner_fun_facts', 'partner_pet_allergy',
    'address', 'address_unit', 'address_notes', 'course_preference',
    'instagram_handle', 'accessibility_needs', 'accessibility_ok',
  ];

  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const { data, error } = await supabase
    .from('couples')
    .update(filtered)
    .eq('id', coupleId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ couple: data });
}

// DELETE /api/organizer/couples/[coupleId] — soft-delete (cancel)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: couple } = await supabase
    .from('couples')
    .select('event_id')
    .eq('id', coupleId)
    .single();

  if (!couple) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const { error } = await supabase
    .from('couples')
    .update({ cancelled: true, cancelled_at: new Date().toISOString() })
    .eq('id', coupleId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
