import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireEventAccess(eventId);
  if (!auth.success) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createAdminClient();
  const { data: couples } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name')
    .eq('event_id', eventId)
    .eq('cancelled', false)
    .order('invited_name');

  return NextResponse.json({ couples: couples || [] });
}
