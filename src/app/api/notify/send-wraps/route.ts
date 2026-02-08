import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL, BASE_URL } from '@/lib/resend';
import { ParticipantWrapEmail } from '@/components/emails/participant-wrap';

// POST /api/notify/send-wraps
// Send wrap emails to all participants of an event
// Requires event to be approved first

export async function POST(request: NextRequest) {
  try {
    const { eventId } = await request.json();
    
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    
    // Check if approved
    if (!event.wrap_approved_at) {
      return NextResponse.json({ error: 'Wraps not approved yet' }, { status: 400 });
    }
    
    // Check if already sent
    if (event.wraps_sent_at) {
      return NextResponse.json({ 
        error: 'Wraps already sent', 
        sent_at: event.wraps_sent_at 
      }, { status: 400 });
    }
    
    // Get all couples with their details
    const { data: couples, error: couplesError } = await supabase
      .from('couples')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'registered');
    
    if (couplesError || !couples) {
      return NextResponse.json({ error: 'Failed to fetch couples' }, { status: 500 });
    }
    
    // Format event date
    const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };
    
    // Send email to each participant
    for (const couple of couples) {
      // Send to invited person
      if (couple.invited_email) {
        try {
          const wrapUrl = `${BASE_URL}/e/${event.slug}/wrap?coupleId=${couple.id}&person=invited`;
          const awardUrl = `${BASE_URL}/e/${event.slug}/award?coupleId=${couple.id}&person=invited`;
          
          const { data: emailData, error: emailError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: couple.invited_email,
            subject: `🎁 Din wrap från ${event.name} är här!`,
            react: ParticipantWrapEmail({
              participantName: couple.invited_name,
              eventName: event.name,
              eventDate,
              wrapUrl,
              awardUrl,
              hasAward: !!couple.invited_award,
              thankYouMessage: event.thank_you_message,
            }),
          });
          
          if (emailError) {
            results.failed++;
            results.errors.push(`${couple.invited_email}: ${emailError.message}`);
          } else {
            results.sent++;
            // Log the email
            await supabase.from('email_log').insert({
              event_id: eventId,
              couple_id: couple.id,
              email_type: 'participant_wrap',
              recipient_email: couple.invited_email,
              resend_id: emailData?.id,
            });
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`${couple.invited_email}: ${err}`);
        }
      }
      
      // Send to partner if exists
      if (couple.partner_email) {
        try {
          const wrapUrl = `${BASE_URL}/e/${event.slug}/wrap?coupleId=${couple.id}&person=partner`;
          const awardUrl = `${BASE_URL}/e/${event.slug}/award?coupleId=${couple.id}&person=partner`;
          
          const { data: emailData, error: emailError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: couple.partner_email,
            subject: `🎁 Din wrap från ${event.name} är här!`,
            react: ParticipantWrapEmail({
              participantName: couple.partner_name || 'Partner',
              eventName: event.name,
              eventDate,
              wrapUrl,
              awardUrl,
              hasAward: !!couple.partner_award,
              thankYouMessage: event.thank_you_message,
            }),
          });
          
          if (emailError) {
            results.failed++;
            results.errors.push(`${couple.partner_email}: ${emailError.message}`);
          } else {
            results.sent++;
            await supabase.from('email_log').insert({
              event_id: eventId,
              couple_id: couple.id,
              email_type: 'participant_wrap',
              recipient_email: couple.partner_email,
              resend_id: emailData?.id,
            });
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`${couple.partner_email}: ${err}`);
        }
      }
    }
    
    // Mark event as wraps sent
    await supabase
      .from('events')
      .update({ wraps_sent_at: new Date().toISOString() })
      .eq('id', eventId);
    
    return NextResponse.json({
      success: true,
      results,
    });
    
  } catch (error) {
    console.error('Error sending wraps:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
