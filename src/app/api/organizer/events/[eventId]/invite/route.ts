import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import { resend, FROM_EMAIL, BASE_URL } from '@/lib/resend';

// POST /api/organizer/events/[eventId]/invite
// Invite a co-organizer

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
    
    // Check access
    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'No access to this event' }, { status: 403 });
    }
    
    const { email, sendEmail = true } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Can't invite yourself
    if (normalizedEmail === organizer.email) {
      return NextResponse.json({ error: 'Du kan inte bjuda in dig själv' }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // Get event details
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single();
    
    // Check current organizer count
    const { count } = await supabase
      .from('event_organizers')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('removed_at', null);
    
    if ((count || 0) >= 5) {
      return NextResponse.json({ error: 'Max 5 arrangörer per event' }, { status: 400 });
    }
    
    // Get or create invitee organizer
    let { data: invitee } = await supabase
      .from('organizers')
      .select('id')
      .eq('email', normalizedEmail)
      .single();
    
    if (!invitee) {
      const { data: newOrganizer } = await supabase
        .from('organizers')
        .insert({ email: normalizedEmail })
        .select()
        .single();
      invitee = newOrganizer;
    }
    
    if (!invitee) {
      return NextResponse.json({ error: 'Failed to create invitee' }, { status: 500 });
    }
    
    // Check if already invited
    const { data: existingInvite } = await supabase
      .from('event_organizers')
      .select('accepted_at, removed_at')
      .eq('event_id', eventId)
      .eq('organizer_id', invitee.id)
      .single();
    
    if (existingInvite && !existingInvite.removed_at) {
      return NextResponse.json({ 
        error: existingInvite.accepted_at 
          ? 'Denna person är redan arrangör' 
          : 'Denna person har redan en väntande inbjudan'
      }, { status: 400 });
    }
    
    // Create or update invite
    const inviteToken = crypto.randomUUID();
    
    if (existingInvite) {
      // Reactivate removed invite
      await supabase
        .from('event_organizers')
        .update({
          removed_at: null,
          accepted_at: null,
          invited_at: new Date().toISOString(),
          invite_token: inviteToken,
        })
        .eq('event_id', eventId)
        .eq('organizer_id', invitee.id);
    } else {
      // New invite
      await supabase
        .from('event_organizers')
        .insert({
          event_id: eventId,
          organizer_id: invitee.id,
          role: 'co-organizer',
          invite_token: inviteToken,
        });
    }
    
    // Generate invite link
    const inviteUrl = `${BASE_URL}/organizer/invite/${inviteToken}`;
    
    // Send email if requested
    if (sendEmail) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: normalizedEmail,
        subject: `🎉 Du är inbjuden som arrangör till ${event?.name}!`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4f46e5;">🚴 Cykelfesten</h1>
            <p>Hej!</p>
            <p><strong>${organizer.name}</strong> har bjudit in dig som medarrangör för <strong>${event?.name}</strong>!</p>
            <p>Klicka på knappen nedan för att acceptera inbjudan:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Acceptera inbjudan →
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              Eller kopiera länken: ${inviteUrl}
            </p>
          </div>
        `,
      });
    }
    
    return NextResponse.json({ 
      success: true,
      invite_url: inviteUrl,
    });
    
  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/organizer/events/[eventId]/invite
// Get shareable invite link (for founder/co-organizer to share manually)

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
    
    // Check access
    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'No access to this event' }, { status: 403 });
    }
    
    const supabase = await createClient();
    
    // Get or create a generic invite token for this event
    // This is a "shareable link" anyone can use
    let { data: genericInvite } = await supabase
      .from('event_invite_links')
      .select('token')
      .eq('event_id', eventId)
      .single();
    
    if (!genericInvite) {
      const token = crypto.randomUUID();
      const { data } = await supabase
        .from('event_invite_links')
        .insert({ event_id: eventId, token })
        .select()
        .single();
      genericInvite = data;
    }
    
    const inviteUrl = `${BASE_URL}/organizer/join/${genericInvite?.token}`;
    
    return NextResponse.json({ invite_url: inviteUrl });
    
  } catch (error) {
    console.error('Get invite link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
