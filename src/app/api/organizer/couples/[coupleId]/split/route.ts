import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';
import { cascadeChanges } from '@/lib/matching/cascade';

// POST /api/organizer/couples/[coupleId]/split
// Split a couple into two solo entries

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: couple } = await supabase
    .from('couples')
    .select('*')
    .eq('id', coupleId)
    .single();

  if (!couple) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!couple.partner_name) {
    return NextResponse.json({ error: 'Couple has no partner to split' }, { status: 400 });
  }

  // Verify access
  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });

  // Create new solo entry for the partner
  const { data: newCouple, error: insertError } = await supabase
    .from('couples')
    .insert({
      event_id: couple.event_id,
      invited_name: couple.partner_name,
      invited_email: couple.partner_email,
      invited_phone: couple.partner_phone || null,
      invited_allergies: couple.partner_allergies,
      invited_birth_year: couple.partner_birth_year,
      invited_fun_facts: couple.partner_fun_facts,
      invited_pet_allergy: couple.partner_pet_allergy || 'none',
      address: couple.address,
      address_unit: couple.address_unit,
      address_notes: couple.address_notes,
      confirmed: true,
    })
    .select('id')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Clear partner from original couple
  const { error: updateError } = await supabase
    .from('couples')
    .update({
      partner_name: null,
      partner_email: null,
      partner_phone: null,
      partner_allergies: null,
      partner_birth_year: null,
      partner_fun_facts: null,
      partner_pet_allergy: 'none',
      partner_invite_token: null,
      partner_invite_sent_at: null,
    })
    .eq('id', coupleId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, active_match_plan_id')
    .eq('id', couple.event_id)
    .single();

  if (event?.active_match_plan_id) {
    await cascadeChanges({
      supabase,
      eventId: event.id,
      matchPlanId: event.active_match_plan_id,
      type: 'split',
      coupleId,
      details: {
        newCoupleId: newCouple.id,
      },
    });
  }

  return NextResponse.json({
    success: true,
    original_id: coupleId,
    new_id: newCouple.id,
    message: `${couple.partner_name} är nu en egen anmälan`,
  });
}
