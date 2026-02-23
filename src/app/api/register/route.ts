import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyInviteToken } from '@/lib/tokens';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { geocodeAddress } from '@/lib/geocode';

// POST /api/register
// Server-side registration: insert couple + trigger emails

const REGISTER_RATE_LIMIT = {
  byIp: { maxCount: 10, windowMinutes: 15, prefix: 'register:ip' },
  byEmail: { maxCount: 3, windowMinutes: 60, prefix: 'register:email' },
};

// Allowed fields for couple insert (whitelist)
const ALLOWED_FIELDS = new Set([
  'invited_name', 'invited_email', 'invited_phone', 'invited_allergies',
  'invited_birth_year', 'invited_fun_facts', 'invited_pet_allergy',
  'partner_name', 'partner_email', 'partner_phone', 'partner_allergies',
  'partner_birth_year', 'partner_fun_facts', 'partner_pet_allergy',
  'address', 'address_unit', 'address_notes', 'course_preference',
  'instagram_handle', 'accessibility_needs', 'accessibility_ok',
  'coordinates',
]);

function validateAndSanitize(formData: Record<string, unknown>): { clean: Record<string, unknown>; errors: string[] } {
  const clean: Record<string, unknown> = {};
  const errors: string[] = [];

  // Only allow whitelisted fields
  for (const [key, value] of Object.entries(formData)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    clean[key] = value;
  }

  // Required: invited_name (2-100 chars)
  if (!clean.invited_name || typeof clean.invited_name !== 'string') {
    errors.push('Namn krävs');
  } else if (clean.invited_name.length < 2 || clean.invited_name.length > 100) {
    errors.push('Namn måste vara 2-100 tecken');
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (clean.invited_email && typeof clean.invited_email === 'string') {
    if (!emailRegex.test(clean.invited_email) || clean.invited_email.length > 254) {
      errors.push('Ogiltig e-postadress');
    }
  }
  if (clean.partner_email && typeof clean.partner_email === 'string') {
    if (!emailRegex.test(clean.partner_email) || clean.partner_email.length > 254) {
      errors.push('Ogiltig e-postadress för partner');
    }
  }

  // String length caps (prevent abuse)
  for (const field of ['invited_name', 'partner_name', 'address', 'address_unit', 'address_notes', 'instagram_handle', 'accessibility_needs']) {
    if (clean[field] && typeof clean[field] === 'string' && (clean[field] as string).length > 500) {
      clean[field] = (clean[field] as string).slice(0, 500);
    }
  }

  // Birth year validation
  for (const field of ['invited_birth_year', 'partner_birth_year']) {
    if (clean[field] !== undefined && clean[field] !== null) {
      const year = Number(clean[field]);
      if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
        errors.push(`Ogiltigt födelseår`);
      } else {
        clean[field] = year;
      }
    }
  }

  // Array fields: allergies (max 20 items, max 200 chars each)
  for (const field of ['invited_allergies', 'partner_allergies']) {
    if (clean[field] && Array.isArray(clean[field])) {
      clean[field] = (clean[field] as string[])
        .slice(0, 20)
        .map(s => typeof s === 'string' ? s.slice(0, 200) : String(s));
    }
  }

  // Fun facts: accept both legacy string[] and new JSON object format
  for (const field of ['invited_fun_facts', 'partner_fun_facts']) {
    if (clean[field]) {
      if (Array.isArray(clean[field])) {
        // Legacy string[] — accept as-is
        clean[field] = (clean[field] as string[])
          .slice(0, 20)
          .map(s => typeof s === 'string' ? s.slice(0, 200) : String(s));
      } else if (typeof clean[field] === 'object') {
        // New JSON object — trim values
        const obj = clean[field] as Record<string, unknown>;
        const trimmed: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v === 'string') trimmed[k] = v.slice(0, 200);
        }
        clean[field] = Object.keys(trimmed).length > 0 ? trimmed : null;
      }
    }
  }

  // course_preference enum
  if (clean.course_preference && !['starter', 'main', 'dessert'].includes(clean.course_preference as string)) {
    clean.course_preference = null;
  }

  // pet_allergy enum
  for (const field of ['invited_pet_allergy', 'partner_pet_allergy']) {
    if (clean[field] && !['none', 'cat', 'dog', 'both'].includes(clean[field] as string)) {
      clean[field] = 'none';
    }
  }

  return { clean, errors };
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = getClientIp(request);
    const ipKey = `${REGISTER_RATE_LIMIT.byIp.prefix}:${ip}`;
    const ipLimit = await checkRateLimit(
      ipKey,
      REGISTER_RATE_LIMIT.byIp.windowMinutes,
      REGISTER_RATE_LIMIT.byIp.maxCount
    );
    if (!ipLimit.success) {
      return NextResponse.json(
        { error: `För många anmälningar. Försök igen om ${ipLimit.retryAfterSeconds}s.` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { slug, invite_token, ...formData } = body;

    if (!slug || !invite_token) {
      return NextResponse.json({ error: 'Missing slug or invite token' }, { status: 400 });
    }

    // Rate limit by email
    if (formData.invited_email) {
      const emailKey = `${REGISTER_RATE_LIMIT.byEmail.prefix}:${formData.invited_email}`;
      const emailLimit = await checkRateLimit(
        emailKey,
        REGISTER_RATE_LIMIT.byEmail.windowMinutes,
        REGISTER_RATE_LIMIT.byEmail.maxCount
      );
      if (!emailLimit.success) {
        return NextResponse.json(
          { error: `Denna e-postadress har redan registrerats nyligen.` },
          { status: 429 }
        );
      }
    }

    // Validate and sanitize input
    const { clean, errors } = validateAndSanitize(formData);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 });
    }

    // Normalize emails
    if (clean.invited_email) clean.invited_email = (clean.invited_email as string).toLowerCase().trim();
    if (clean.partner_email) clean.partner_email = (clean.partner_email as string).toLowerCase().trim();

    const supabase = createAdminClient();

    // Get event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, status')
      .eq('slug', slug)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
    }

    if (event.status !== 'open') {
      return NextResponse.json({ error: 'Anmälan är inte öppen för detta event' }, { status: 400 });
    }

    // Verify invite token
    if (!verifyInviteToken(event.id, invite_token)) {
      return NextResponse.json({ error: 'Ogiltig inbjudningslänk' }, { status: 403 });
    }

    // Geocode address if provided (non-blocking, best-effort)
    // Use event location as proximity hint for better accuracy
    if (clean.address && !clean.coordinates) {
      // Get event location for proximity bias
      const { data: eventDetails } = await supabase
        .from('events')
        .select('location, coordinates')
        .eq('id', event.id)
        .single();

      const proximity = eventDetails?.coordinates
        ? (() => {
            const m = String(eventDetails.coordinates).match(/\(([^,]+),([^)]+)\)/);
            return m ? { lng: parseFloat(m[1]), lat: parseFloat(m[2]) } : undefined;
          })()
        : undefined;

      const city = eventDetails?.location || undefined;

      const coords = await geocodeAddress(clean.address as string, { proximity, city });
      if (coords) {
        clean.coordinates = coords;
      }
    }

    // Insert couple
    const { data: couple, error: insertError } = await supabase
      .from('couples')
      .insert({
        event_id: event.id,
        ...clean,
        confirmed: true,
      })
      .select('id')
      .single();

    if (insertError) {
      if ((insertError as any).code === '23505') {
        return NextResponse.json(
          { error: 'Denna e-postadress är redan registrerad för detta event.' },
          { status: 409 }
        );
      }
      console.error('Insert couple error:', insertError);
      return NextResponse.json(
        { error: 'Kunde inte spara registreringen. Försök igen.' },
        { status: 500 }
      );
    }

    // Send emails (fire-and-forget, but server-side so they actually run)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://cykelfesten.vercel.app';

    // Confirmation email
    fetch(`${baseUrl}/api/register/notify-registered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couple_id: couple.id }),
    }).catch((err) => console.error('notify-registered failed:', err));

    // Partner invite email
    if (clean.partner_email) {
      fetch(`${baseUrl}/api/register/notify-partner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couple_id: couple.id }),
      }).catch((err) => console.error('notify-partner failed:', err));
    }

    return NextResponse.json({ success: true, couple_id: couple.id });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
