import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

// POST /api/admin/approve-wraps
// Marks wraps as approved by organizer, allowing them to be sent

export async function POST(request: NextRequest) {
  try {
    const { eventId, approvedBy } = await request.json();
    
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 });
    }
    
    // Auth: Require organizer access to this event
    const auth = await requireEventAccess(eventId);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    
    const supabase = await createClient();
    
    // Update event with approval
    const { data, error } = await supabase
      .from('events')
      .update({
        wrap_approved_at: new Date().toISOString(),
        wrap_approved_by: approvedBy || 'admin',
      })
      .eq('id', eventId)
      .select()
      .single();
    
    if (error) {
      console.error('Error approving wraps:', error);
      return NextResponse.json({ error: 'Failed to approve wraps' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      approved_at: data.wrap_approved_at,
    });
    
  } catch (error) {
    console.error('Error in approve-wraps:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
