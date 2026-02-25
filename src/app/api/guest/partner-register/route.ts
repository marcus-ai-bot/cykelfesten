import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// GET /api/guest/partner-register?token=xxx
// Validates partner invite token and returns couple + event info
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('couples')
    .select(
      'id, invited_name, partner_name, partner_email, partner_allergies, partner_address, partner_instagram, partner_birth_year, partner_fun_facts, address, events(name, event_date)'
    )
    .eq('partner_invite_token', token)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Ogiltig eller utgången länk. Be din partner skicka en ny inbjudan.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ couple: data });
}

// POST /api/guest/partner-register
// Body: { token, partner_allergies, partner_address, partner_instagram, partner_birth_year, partner_fun_facts }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const token = body?.token as string | undefined;
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: couple } = await supabase
    .from('couples')
    .select('id')
    .eq('partner_invite_token', token)
    .single();

  if (!couple) {
    return NextResponse.json(
      { error: 'Ogiltig eller utgången länk. Be din partner skicka en ny inbjudan.' },
      { status: 404 }
    );
  }

  const partnerAllergies = Array.isArray(body?.partner_allergies)
    ? body.partner_allergies
    : typeof body?.partner_allergies === 'string'
      ? body.partner_allergies.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

  const updatePayload = {
    partner_allergies: partnerAllergies.length ? partnerAllergies : null,
    partner_address: body?.partner_address || null,
    partner_instagram: body?.partner_instagram || null,
    partner_birth_year: body?.partner_birth_year ? Number(body.partner_birth_year) : null,
    partner_fun_facts: body?.partner_fun_facts && Object.keys(body.partner_fun_facts).length > 0
      ? body.partner_fun_facts
      : null,
  };

  const { error } = await supabase
    .from('couples')
    .update(updatePayload)
    .eq('id', couple.id);

  if (error) {
    return NextResponse.json({ error: 'Kunde inte spara. Försök igen.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
