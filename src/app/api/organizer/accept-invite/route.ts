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
    
    // Find invite (allow already-accepted to handle re-accept gracefully)
    const { data: invite, error: inviteError } = await supabase
      .from('event_organizers')
      .select('*, event:events(id, name)')
      .eq('invite_token', token)
      .is('removed_at', null)
      .single();
    
    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
    }
    
    // If the logged-in organizer doesn't match the invite, re-link:
    // This handles the case where someone was invited by email alias
    // but logs in with their real email (creates a different organizer record)
    if (invite.organizer_id !== organizer.id) {
      // Update the invite to point to the logged-in organizer
      const { error: relinkError } = await supabase
        .from('event_organizers')
        .update({ 
          organizer_id: organizer.id,
          accepted_at: new Date().toISOString(),
          invite_token: null,
        })
        .eq('event_id', invite.event_id)
        .eq('organizer_id', invite.organizer_id)
        .eq('invite_token', token);
      
      if (relinkError) {
        console.error('Relink error:', relinkError);
        return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
      }
    } else {
      // Normal case — same organizer
      const { error: updateError } = await supabase
        .from('event_organizers')
        .update({ 
          accepted_at: new Date().toISOString(),
          invite_token: null,
        })
        .eq('event_id', invite.event_id)
        .eq('organizer_id', organizer.id);
      
      if (updateError) {
        console.error('Accept error:', updateError);
        return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 });
      }
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
