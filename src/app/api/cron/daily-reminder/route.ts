import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL, BASE_URL } from '@/lib/resend';

// GET /api/cron/daily-reminder
// Called by Vercel Cron at 08:00 every day
// Sends reminder to organizers for events that ended but haven't sent wraps

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for sending emails

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In dev, allow without secret
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  const supabase = await createClient();
  
  // Find events where:
  // 1. event_date < today (event has ended)
  // 2. wraps_sent_at is null (wraps haven't been sent)
  // 3. organizer_email is set
  const today = new Date().toISOString().split('T')[0];
  
  const { data: events, error } = await supabase
    .from('events')
    .select('id, name, slug, event_date, organizer_email, wrap_approved_at')
    .lt('event_date', today)
    .is('wraps_sent_at', null)
    .not('organizer_email', 'is', null);
  
  if (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  
  if (!events || events.length === 0) {
    return NextResponse.json({ message: 'No events need reminders', sent: 0 });
  }
  
  const results = {
    sent: 0,
    skipped: 0,
    errors: [] as string[],
  };
  
  for (const event of events) {
    try {
      // Skip if already approved (they just need to send)
      const subject = event.wrap_approved_at
        ? `⏰ Påminnelse: Skicka wrap-emails för ${event.name}`
        : `🎉 ${event.name} är klart – dags att skicka wraps!`;
      
      const adminUrl = `${BASE_URL}/admin/${event.id}`;
      const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      
      const { error: emailError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: event.organizer_email!,
        subject,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4f46e5;">${event.wrap_approved_at ? '⏰' : '🎉'} ${event.name}</h1>
            <p>Hej!</p>
            <p>Eventet <strong>${event.name}</strong> (${eventDate}) ${event.wrap_approved_at ? 'är godkänt men wrap-emails har inte skickats ännu.' : 'är avslutat och väntar på att wrap-sammanfattningar skickas till gästerna.'}</p>
            ${event.wrap_approved_at 
              ? '<p>Klicka nedan för att skicka ut wraps till alla deltagare!</p>'
              : '<p>Innan du skickar ut wraps, granska och godkänn dem i admin.</p>'
            }
            <p style="text-align: center; margin: 30px 0;">
              <a href="${adminUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${event.wrap_approved_at ? '📧 Skicka Wraps →' : '✅ Granska & Godkänn →'}
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">Detta är en automatisk påminnelse från Cykelfesten.</p>
          </div>
        `,
      });
      
      if (emailError) {
        results.errors.push(`${event.name}: ${emailError.message}`);
      } else {
        results.sent++;
        
        // Log the reminder
        await supabase.from('email_log').insert({
          event_id: event.id,
          email_type: 'cron_reminder',
          recipient_email: event.organizer_email,
        });
      }
      
      // Rate limit: 600ms between emails
      await new Promise(resolve => setTimeout(resolve, 600));
      
    } catch (err: any) {
      results.errors.push(`${event.name}: ${err.message}`);
    }
  }
  
  return NextResponse.json({
    message: `Sent ${results.sent} reminders`,
    ...results,
    events_checked: events.length,
  });
}
