import { NextRequest, NextResponse } from 'next/server';
import { requireEventAccess } from '@/lib/auth';
import { createToken } from '@/lib/tokens';

// GET /api/organizer/events/[eventId]/wrap/preview-token?coupleId=xxx&person=invited
// Generates a signed token for wrap preview iframe

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireEventAccess(eventId);

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const coupleId = request.nextUrl.searchParams.get('coupleId');
  const person = request.nextUrl.searchParams.get('person') as 'invited' | 'partner';

  if (!coupleId || !person || !['invited', 'partner'].includes(person)) {
    return NextResponse.json({ error: 'coupleId and person required' }, { status: 400 });
  }

  const token = createToken(coupleId, person);

  return NextResponse.json({ token });
}
