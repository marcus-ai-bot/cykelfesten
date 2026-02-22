import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL, BASE_URL } from '@/lib/resend';
import { OrganizerReminderEmail } from '@/components/emails/organizer-reminder';
import { countFunFacts } from '@/lib/fun-facts';

// POST /api/notify/organizer-reminder
// Send reminder email to organizer to fill in fun facts and approve wraps
// Can be called by cron or manually from admin

export async function POST(request: NextRequest) {
  try {
    const { eventId, force } = await request.json();
    
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
    
    if (!event.organizer_email) {
      return NextResponse.json({ error: 'No organizer email configured' }, { status: 400 });
    }
    
    // Check if already approved (unless force=true)
    if (event.wrap_approved_at && !force) {
      return NextResponse.json({ 
        error: 'Wraps already approved', 
        approved_at: event.wrap_approved_at 
      }, { status: 400 });
    }
    
    // Count couples and missing fun facts
    const { data: couples } = await supabase
      .from('couples')
      .select('id, invited_fun_facts')
      .eq('event_id', eventId);
    
    const totalCouples = couples?.length || 0;
    const missingFunFacts = couples?.filter(c => !countFunFacts(c.invited_fun_facts)).length || 0;
    
    // Format date
    const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    // Send email via Resend
    const adminUrl = `${BASE_URL}/admin/${eventId}`;
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: event.organizer_email,
      subject: `🎉 ${event.name} är klart – dags att skicka wraps!`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4f46e5;">🎉 Dags att avsluta ${event.name}!</h1>
          <p>Hej arrangör!</p>
          <p>Eventet <strong>${event.name}</strong> (${eventDate}) är nu avslutat.</p>
          <p>Innan vi skickar ut wrap-sammanfattningar till gästerna behöver du:</p>
          <ul>
            <li><strong>Fyll i fun facts</strong> - ${missingFunFacts} av ${totalCouples} par saknar fun facts</li>
            <li><strong>Granska wraps</strong> - Kolla att allt ser bra ut</li>
            <li><strong>Godkänn & skicka</strong> - Klicka på knappen i admin</li>
          </ul>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${adminUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">Öppna Admin →</a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">Detta mail skickades automatiskt från Cykelfesten.</p>
        </div>
      `,
    });
    
    if (emailError) {
      console.error('Resend error:', emailError);
      return NextResponse.json({ error: 'Failed to send email', details: emailError }, { status: 500 });
    }
    
    // Log the email
    await supabase.from('email_log').insert({
      event_id: eventId,
      email_type: 'organizer_reminder',
      recipient_email: event.organizer_email,
      resend_id: emailData?.id,
    });
    
    return NextResponse.json({ 
      success: true, 
      resend_id: emailData?.id,
      sent_to: event.organizer_email,
    });
    
  } catch (error) {
    console.error('Error sending organizer reminder:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
