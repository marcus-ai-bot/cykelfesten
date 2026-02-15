import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';

// POST /api/organizer/accept-invite
// Accept an organizer invite

export async function POST(request: NextRequest) {
  try {
    const organizer = await getOrganizer();
    
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }
    
    const supabase = createAdminClient();
    
    // Find invite
    const { data: invite, error: inviteError } = await supabase
      .from('event_organizers')
      .select('*, event:events(id, name)')
      .eq('invite_token', token)
      .is('removed_at', null)
      .is('accepted_at', null)
      .single();
    
    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
    }
    
    // Check that the logged-in user matches the invited organizer
    if (invite.organizer_id !== organizer.id) {
      return NextResponse.json({ 
        error: 'Denna inbjudan är till en annan e-postadress' 
      }, { status: 403 });
    }
    
    // Accept invite
    const { error: updateError } = await supabase
      .from('event_organizers')
      .update({ 
        accepted_at: new Date().toISOString(),
        invite_token: null, // Clear token after use
      })
      .eq('event_id', invite.event_id)
      .eq('organizer_id', organizer.id);
    
    if (updateError) {
      console.error('Accept error:', updateError);
      return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
    }
    
    const event = invite.event as any;
    
    return NextResponse.json({ 
      success: true,
      event_id: event.id,
      event_name: event.name,
    });
    
  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
