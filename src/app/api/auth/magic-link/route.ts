import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL, BASE_URL } from '@/lib/resend';
import { randomBytes } from 'crypto';

// POST /api/auth/magic-link
// Send a magic link to an organizer's email

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    const supabase = await createClient();
    
    // Check if organizer exists
    let { data: organizer } = await supabase
      .from('organizers')
      .select('id, name')
      .eq('email', normalizedEmail)
      .single();
    
    // If not, create them (they'll set name on first login)
    if (!organizer) {
      const { data: newOrganizer, error } = await supabase
        .from('organizers')
        .insert({ email: normalizedEmail })
        .select()
        .single();
      
      if (error || !newOrganizer) {
        console.error('Create organizer error:', error);
        return NextResponse.json({ error: 'Failed to create organizer' }, { status: 500 });
      }
      organizer = newOrganizer;
    }
    
    // Safety check (should never happen after above)
    if (!organizer) {
      return NextResponse.json({ error: 'Organizer not found' }, { status: 500 });
    }
    
    // Generate magic link token (valid 1 hour)
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    // Store token in database
    const { error: tokenError } = await supabase
      .from('magic_link_tokens')
      .upsert({
        organizer_id: organizer.id,
        token,
        expires_at: expiresAt.toISOString(),
        used_at: null,
      }, {
        onConflict: 'organizer_id',
      });
    
    if (tokenError) {
      console.error('Token error:', tokenError);
      return NextResponse.json({ error: 'Failed to create login link' }, { status: 500 });
    }
    
    // Send email
    const loginUrl = `${BASE_URL}/api/auth/verify?token=${token}`;
    
    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: '🔐 Din inloggningslänk till Cykelfesten',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4f46e5;">🚴 Cykelfesten</h1>
          <p>Hej${organizer.name ? ` ${organizer.name}` : ''}!</p>
          <p>Klicka på knappen nedan för att logga in:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Logga in →
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Länken är giltig i 1 timme. Om du inte begärde denna länk kan du ignorera detta mail.
          </p>
        </div>
      `,
    });
    
    if (emailError) {
      console.error('Email error:', emailError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Login link sent',
    });
    
  } catch (error) {
    console.error('Magic link error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
