import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Send Notifications API
 * 
 * Sends notifications to participants:
 * - assignment: "Du lagar huvudrätt"
 * - envelope_ready: "Kuvertet för förrätt är öppet!"
 * - reminder: "Festen börjar om 2 timmar"
 * 
 * Idempotent: checks notification table before sending.
 */

type NotificationType = 'assignment' | 'envelope_ready' | 'reminder' | 'envelope_changed';

interface SendNotificationRequest {
  event_id: string;
  notification_type: NotificationType;
  couple_ids?: string[]; // If not provided, sends to all active couples
  course?: string; // For envelope notifications
}

export async function POST(request: Request) {
  try {
    const body: SendNotificationRequest = await request.json();
    const { event_id, notification_type, couple_ids, course } = body;
    
    if (!event_id || !notification_type) {
      return NextResponse.json(
        { error: 'event_id och notification_type krävs' },
        { status: 400 }
      );
    }
    
    const supabase = createAdminClient();
    
    // Get event with active match plan
    const { data: event } = await supabase
      .from('events')
      .select('*, match_plans!active_match_plan_id(*)')
      .eq('id', event_id)
      .single();
    
    if (!event) {
      return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
    }
    
    // Get couples to notify
    let query = supabase
      .from('couples')
      .select('*, assignments!inner(*)')
      .eq('event_id', event_id)
      .eq('cancelled', false);
    
    if (couple_ids?.length) {
      query = query.in('id', couple_ids);
    }
    
    const { data: couples } = await query;
    
    if (!couples?.length) {
      return NextResponse.json({ error: 'Inga par att notifiera' }, { status: 400 });
    }
    
    const results: { couple_id: string; status: string; email?: string }[] = [];
    const matchPlanId = event.active_match_plan_id;
    
    for (const couple of couples) {
      // Create idempotency key
      const idempotencyKey = `${matchPlanId}:${couple.id}:${notification_type}${course ? `:${course}` : ''}`;
      
      // Check if already sent
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .single();
      
      if (existing) {
        results.push({ couple_id: couple.id, status: 'already_sent' });
        continue;
      }
      
      // Build notification content based on type
      let subject = '';
      let body = '';
      const assignment = couple.assignments?.[0];
      const courseLabels: Record<string, string> = {
        starter: 'förrätt',
        main: 'huvudrätt', 
        dessert: 'efterrätt',
      };
      
      switch (notification_type) {
        case 'assignment':
          subject = `🍽️ Din uppgift på ${event.name}`;
          body = `Hej ${couple.invited_name}!\n\nNi har blivit tilldelade att laga ${courseLabels[assignment?.course] || 'okänd rätt'} på ${event.name}.\n\nLogga in för att se mer detaljer och era gästers allergier.\n\n🔗 ${process.env.NEXT_PUBLIC_APP_URL || 'https://cykelfesten.vercel.app'}/e/${event.slug}/my`;
          break;
          
        case 'envelope_ready':
          subject = `✉️ Kuvertet för ${courseLabels[course!] || course} är öppet!`;
          body = `Hej ${couple.invited_name}!\n\nKuvertet för ${courseLabels[course!] || course} är nu öppet. Öppna det för att se var ni ska!\n\n🔗 ${process.env.NEXT_PUBLIC_APP_URL || 'https://cykelfesten.vercel.app'}/e/${event.slug}/my`;
          break;
          
        case 'reminder':
          subject = `⏰ Påminnelse: ${event.name} börjar snart!`;
          body = `Hej ${couple.invited_name}!\n\n${event.name} börjar snart. Glöm inte att kolla era kuvert!\n\n🔗 ${process.env.NEXT_PUBLIC_APP_URL || 'https://cykelfesten.vercel.app'}/e/${event.slug}/my`;
          break;
          
        case 'envelope_changed':
          subject = `📍 Uppdaterad adress för ${courseLabels[course!] || course}`;
          body = `Hej ${couple.invited_name}!\n\nPå grund av ett avhopp har adressen för ${courseLabels[course!] || course} uppdaterats. Öppna kuvertet för att se den nya adressen.\n\n🔗 ${process.env.NEXT_PUBLIC_APP_URL || 'https://cykelfesten.vercel.app'}/e/${event.slug}/my`;
          break;
      }
      
      // Store notification record (marks as "to be sent")
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          match_plan_id: matchPlanId,
          couple_id: couple.id,
          notification_type,
          content: { subject, body, course },
          idempotency_key: idempotencyKey,
          sent_at: new Date().toISOString(), // For now, mark as sent immediately
        });
      
      if (insertError) {
        results.push({ couple_id: couple.id, status: 'error', email: couple.invited_email });
        continue;
      }
      
      // TODO: Actually send email via Resend/Supabase/etc
      // For now, just log it
      console.log(`[NOTIFICATION] To: ${couple.invited_email}, Subject: ${subject}`);
      
      results.push({ 
        couple_id: couple.id, 
        status: 'sent', 
        email: couple.invited_email 
      });
    }
    
    // Log notification batch
    await supabase.from('event_log').insert({
      event_id,
      match_plan_id: matchPlanId,
      action: 'notifications_sent',
      details: {
        notification_type,
        course,
        total: results.length,
        sent: results.filter(r => r.status === 'sent').length,
        skipped: results.filter(r => r.status === 'already_sent').length,
      },
    });
    
    return NextResponse.json({
      success: true,
      notification_type,
      results,
      summary: {
        total: results.length,
        sent: results.filter(r => r.status === 'sent').length,
        already_sent: results.filter(r => r.status === 'already_sent').length,
        errors: results.filter(r => r.status === 'error').length,
      },
    });
    
  } catch (error) {
    console.error('Notification error:', error);
    return NextResponse.json(
      { error: 'Kunde inte skicka notifieringar', details: String(error) },
      { status: 500 }
    );
  }
}
