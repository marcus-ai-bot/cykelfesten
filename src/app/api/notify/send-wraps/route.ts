import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL, BASE_URL } from '@/lib/resend';

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
    
    // Get all couples with their details (exclude cancelled)
    const { data: couples, error: couplesError } = await supabase
      .from('couples')
      .select('*')
      .eq('event_id', eventId)
      .or('cancelled.is.null,cancelled.eq.false');
    
    if (couplesError) {
      console.error('Couples fetch error:', couplesError);
      return NextResponse.json({ error: 'Failed to fetch couples', details: couplesError.message }, { status: 500 });
    }
    
    if (!couples || couples.length === 0) {
      return NextResponse.json({ error: 'No couples found for this event' }, { status: 400 });
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
            html: `
              <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; padding: 30px 0;">
                  <h1 style="color: #4f46e5; margin: 0;">🎉 Din Wrap är här!</h1>
                  <p style="color: #6b7280; margin: 10px 0 0 0;">${event.name} • ${eventDate}</p>
                </div>
                <p>Hej ${couple.invited_name}!</p>
                <p>Tack för en fantastisk kväll! Nu är din personliga wrap-sammanfattning redo.</p>
                ${event.thank_you_message ? `<div style="background: #fef3c7; padding: 15px 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;"><p style="margin: 0; font-style: italic;">"${event.thank_you_message}"</p><p style="margin: 10px 0 0 0; font-size: 14px; color: #92400e;">– Arrangörerna</p></div>` : ''}
                <p style="text-align: center; margin: 30px 0;">
                  <a href="${wrapUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">🎁 Öppna din Wrap</a>
                </p>
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">Du får detta mail för att du deltog i ${event.name}</p>
              </div>
            `,
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
          
          const partnerName = couple.partner_name || 'Partner';
          const { data: emailData, error: emailError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: couple.partner_email,
            subject: `🎁 Din wrap från ${event.name} är här!`,
            html: `
              <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; padding: 30px 0;">
                  <h1 style="color: #4f46e5; margin: 0;">🎉 Din Wrap är här!</h1>
                  <p style="color: #6b7280; margin: 10px 0 0 0;">${event.name} • ${eventDate}</p>
                </div>
                <p>Hej ${partnerName}!</p>
                <p>Tack för en fantastisk kväll! Nu är din personliga wrap-sammanfattning redo.</p>
                ${event.thank_you_message ? `<div style="background: #fef3c7; padding: 15px 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;"><p style="margin: 0; font-style: italic;">"${event.thank_you_message}"</p><p style="margin: 10px 0 0 0; font-size: 14px; color: #92400e;">– Arrangörerna</p></div>` : ''}
                <p style="text-align: center; margin: 30px 0;">
                  <a href="${wrapUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">🎁 Öppna din Wrap</a>
                </p>
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">Du får detta mail för att du deltog i ${event.name}</p>
              </div>
            `,
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
