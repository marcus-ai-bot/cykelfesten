import { NextRequest, NextResponse } from 'next/server';
import { requireEventAccess } from '@/lib/auth';
import { createInviteToken } from '@/lib/tokens';
import { createAdminClient } from '@/lib/supabase/server';

// GET /api/organizer/events/[eventId]/invite-link
// Returns the shareable invite URL for guest registration

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  
  const auth = await requireEventAccess(eventId);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  
  const supabase = createAdminClient();
  const { data: event } = await supabase
    .from('events')
    .select('slug')
    .eq('id', eventId)
    .single();
  
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  
  const token = createInviteToken(eventId);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://cykelfesten.vercel.app';
  const inviteUrl = `${baseUrl}/e/${event.slug}/register?invite=${token}`;
  
  return NextResponse.json({ inviteUrl, token });
}
