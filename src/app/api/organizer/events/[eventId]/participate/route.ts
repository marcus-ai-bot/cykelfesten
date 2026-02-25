import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import { signToken } from '@/lib/tokens';
import { cookies } from 'next/headers';

/**
 * GET /api/organizer/events/[eventId]/participate
 * Check if current organizer is participating as a couple
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'No access' }, { status: 403 });
    }

    const supabase = createAdminClient();

    // Check if organizer has a couple in this event
    const { data: couple } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, invited_email, partner_email, address, confirmed, cancelled')
      .eq('event_id', eventId)
      .eq('invited_email', organizer.email.toLowerCase())
      .eq('cancelled', false)
      .maybeSingle();

    // Also check if they're listed as partner in another couple
    const { data: partnerCouple } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, invited_email, partner_email, address, confirmed, cancelled')
      .eq('event_id', eventId)
      .eq('partner_email', organizer.email.toLowerCase())
      .eq('cancelled', false)
      .maybeSingle();

    const participating = couple || partnerCouple;

    // Get co-organizers for "pair with co-organizer" feature
    const { data: coOrgs } = await supabase
      .from('event_organizers')
      .select('organizer_id, role, organizers!inner(id, email, name)')
      .eq('event_id', eventId)
      .is('removed_at', null)
      .neq('organizer_id', organizer.id);

    const coOrganizers = (coOrgs || []).map((co: any) => ({
      id: co.organizers.id,
      email: co.organizers.email,
      name: co.organizers.name,
      role: co.role,
    }));

    return NextResponse.json({
      participating: !!participating,
      couple: participating || null,
      isPartner: !!partnerCouple && !couple,
      coOrganizers,
    });
  } catch (err: any) {
    console.error('GET participate error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/organizer/events/[eventId]/participate
 * Register organizer as a participating couple
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'No access' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const body = await request.json();

    // Validate required fields
    const { invited_name, partner_name, partner_email, address, coordinates } = body;
    const missing = [
      !invited_name && 'ditt namn',
      !partner_name && 'partnerns namn',
      !address && 'adress',
    ].filter(Boolean);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Fyll i: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if already participating
    const { data: existing } = await supabase
      .from('couples')
      .select('id')
      .eq('event_id', eventId)
      .eq('invited_email', organizer.email.toLowerCase())
      .eq('cancelled', false)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Du är redan registrerad som deltagare' },
        { status: 409 }
      );
    }

    // If pairing with co-organizer, check they haven't registered separately
    if (body.coOrganizerId) {
      const { data: coOrg } = await supabase
        .from('organizers')
        .select('email, name')
        .eq('id', body.coOrganizerId)
        .single();

      if (coOrg) {
        const { data: coOrgCouple } = await supabase
          .from('couples')
          .select('id, invited_name')
          .eq('event_id', eventId)
          .eq('invited_email', coOrg.email.toLowerCase())
          .eq('cancelled', false)
          .maybeSingle();

        if (coOrgCouple) {
          return NextResponse.json({
            error: `${coOrg.name || coOrg.email} har redan registrerat sig som "${coOrgCouple.invited_name}". Avregistrera dem först, eller registrera dig med en annan partner.`,
            existingCouple: coOrgCouple.id,
          }, { status: 409 });
        }
      }
    }

    // Build coordinates point
    let coordsPoint: string | null = null;
    if (coordinates && typeof coordinates.lat === 'number' && typeof coordinates.lng === 'number') {
      coordsPoint = `(${coordinates.lng},${coordinates.lat})`;
    }

    // Create couple
    const { data: couple, error: insertError } = await supabase
      .from('couples')
      .insert({
        event_id: eventId,
        invited_name: invited_name.trim(),
        invited_email: organizer.email.toLowerCase(),
        invited_phone: body.invited_phone?.trim() || null,
        partner_name: partner_name.trim(),
        partner_email: partner_email?.toLowerCase().trim() || null,
        partner_phone: body.partner_phone?.trim() || null,
        address: address.trim(),
        coordinates: coordsPoint,
        invited_allergies: body.invited_allergies || null,
        partner_allergies: body.partner_allergies || null,
        invited_fun_facts: body.invited_fun_facts || null,
        partner_fun_facts: body.partner_fun_facts || null,
        course_preference: body.course_preference || null,
        accessibility_ok: body.accessibility_ok ?? true,
        accessibility_needs: body.accessibility_needs || null,
        confirmed: true,
        cancelled: false,
        role: 'organizer',
      })
      .select()
      .single();

    if (insertError) {
      if ((insertError as any).code === '23505') {
        return NextResponse.json(
          { error: 'Denna e-postadress är redan registrerad för detta event.' },
          { status: 409 }
        );
      }
      console.error('Insert couple error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Always set guest_session to organizer's email (overwrite any stale session)
    const guestToken = signToken({ email: organizer.email.toLowerCase(), type: 'guest' });
    const response = NextResponse.json({ couple, guestSessionSet: true });
    response.cookies.set('guest_session', guestToken, {
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    return response;
  } catch (err: any) {
    console.error('POST participate error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/organizer/events/[eventId]/participate
 * Update organizer's couple data
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'No access' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const body = await request.json();

    // Find couple
    const { data: couple } = await supabase
      .from('couples')
      .select('id, event_id')
      .eq('event_id', eventId)
      .eq('invited_email', organizer.email.toLowerCase())
      .eq('cancelled', false)
      .maybeSingle();

    if (!couple) {
      return NextResponse.json({ error: 'Du är inte registrerad som deltagare' }, { status: 404 });
    }

    // Allowed update fields
    const allowed = [
      'invited_name', 'invited_phone', 'partner_name', 'partner_email', 'partner_phone',
      'address', 'address_unit', 'address_notes', 'course_preference',
      'invited_allergies', 'partner_allergies', 'invited_fun_facts', 'partner_fun_facts',
      'accessibility_ok', 'accessibility_needs',
    ];

    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    // Handle coordinates
    if (body.coordinates && typeof body.coordinates.lat === 'number' && typeof body.coordinates.lng === 'number') {
      updates.coordinates = `(${body.coordinates.lng},${body.coordinates.lat})`;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inga fält att uppdatera' }, { status: 400 });
    }

    const addressChanged = 'address' in updates;

    const { data, error } = await supabase
      .from('couples')
      .update(updates)
      .eq('id', couple.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If address changed after matching, trigger cascade
    let rematchWarning: string | null = null;
    if (addressChanged) {
      const { data: event } = await supabase
        .from('events')
        .select('id, active_match_plan_id')
        .eq('id', eventId)
        .single();

      if (event?.active_match_plan_id) {
        try {
          const { cascadeChanges } = await import('@/lib/matching/cascade');
          await cascadeChanges({
            supabase,
            eventId: event.id,
            matchPlanId: event.active_match_plan_id,
            type: 'address_change',
            coupleId: couple.id,
            details: {
              newAddress: data.address,
              newAddressNotes: data.address_notes ?? null,
            },
          });
        } catch (e) {
          console.error('Cascade error (non-fatal):', e);
        }
        rematchWarning = 'Adress uppdaterad. Kuvert har uppdaterats automatiskt.';
      }
    }

    return NextResponse.json({ couple: data, warning: rematchWarning });
  } catch (err: any) {
    console.error('PATCH participate error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/organizer/events/[eventId]/participate
 * Before matching: hard delete couple
 * After matching: soft cancel (cancelled=true) + rematch warning
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'No access' }, { status: 403 });
    }

    const supabase = createAdminClient();

    // Find the couple (check both as invited and as partner)
    const { data: couple } = await supabase
      .from('couples')
      .select('id, partner_email')
      .eq('event_id', eventId)
      .eq('invited_email', organizer.email.toLowerCase())
      .eq('cancelled', false)
      .maybeSingle();

    if (!couple) {
      return NextResponse.json({ error: 'Du är inte registrerad som deltagare' }, { status: 404 });
    }

    // Check if matching has been run
    const { data: event } = await supabase
      .from('events')
      .select('active_match_plan_id')
      .eq('id', eventId)
      .single();

    const hasMatching = !!event?.active_match_plan_id;

    if (hasMatching) {
      // After matching: soft cancel
      const { error } = await supabase
        .from('couples')
        .update({ cancelled: true })
        .eq('id', couple.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        method: 'cancelled',
        cancelledCoupleId: couple.id,
        warning: 'Du har avregistrerats. Matchningen behöver köras om för att hantera ändringen.',
      });
    } else {
      // Before matching: hard delete
      const { error } = await supabase
        .from('couples')
        .delete()
        .eq('id', couple.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        method: 'deleted',
      });
    }
  } catch (err: any) {
    console.error('DELETE participate error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
