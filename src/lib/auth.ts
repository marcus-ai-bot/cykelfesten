import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface Organizer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface OrganizerWithEvents extends Organizer {
  events: {
    event_id: string;
    role: 'founder' | 'co-organizer';
    event: {
      id: string;
      name: string;
      slug: string;
      event_date: string;
    };
  }[];
}

interface EventLinkRaw {
  event_id: string;
  role: string;
  event: {
    id: string;
    name: string;
    slug: string;
    event_date: string;
  } | null;
}

/**
 * Get current organizer from session cookie
 * Returns null if not logged in
 */
export async function getOrganizer(): Promise<Organizer | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('organizer_session')?.value;
  
  console.log('getOrganizer - sessionToken exists:', !!sessionToken);
  
  if (!sessionToken) {
    console.log('No session token found in cookies');
    return null;
  }
  
  const supabase = await createClient();
  
  // Find valid session
  const { data: session, error } = await supabase
    .from('organizer_sessions')
    .select('organizer_id, expires_at')
    .eq('session_token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error || !session) {
    return null;
  }
  
  // Get organizer
  const { data: organizer } = await supabase
    .from('organizers')
    .select('*')
    .eq('id', session.organizer_id)
    .single();
  
  return organizer;
}

/**
 * Require organizer to be logged in
 * Redirects to login if not
 */
export async function requireOrganizer(): Promise<Organizer> {
  const organizer = await getOrganizer();
  
  if (!organizer) {
    redirect('/login');
  }
  
  return organizer;
}

/**
 * Get organizer with their events
 */
export async function getOrganizerWithEvents(): Promise<OrganizerWithEvents | null> {
  const organizer = await getOrganizer();
  
  if (!organizer) {
    return null;
  }
  
  const supabase = await createClient();
  
  // Get events where this person is an organizer
  const { data: eventLinks } = await supabase
    .from('event_organizers')
    .select(`
      event_id,
      role,
      event:events(id, name, slug, event_date)
    `)
    .eq('organizer_id', organizer.id)
    .is('removed_at', null)
    .not('accepted_at', 'is', null);
  
  // Transform raw data to proper type
  const events = (eventLinks || [])
    .filter((link: any) => link.event)
    .map((link: any) => ({
      event_id: link.event_id,
      role: link.role as 'founder' | 'co-organizer',
      event: link.event,
    }));
  
  return {
    ...organizer,
    events,
  };
}

/**
 * Check if organizer has access to an event
 */
export async function checkEventAccess(
  organizerId: string, 
  eventId: string
): Promise<{ hasAccess: boolean; role: 'founder' | 'co-organizer' | null }> {
  const supabase = await createClient();
  
  const { data } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('organizer_id', organizerId)
    .eq('event_id', eventId)
    .is('removed_at', null)
    .not('accepted_at', 'is', null)
    .single();
  
  return {
    hasAccess: !!data,
    role: data?.role || null,
  };
}

/**
 * Logout - clear session
 */
export async function logout() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('organizer_session')?.value;
  
  if (sessionToken) {
    const supabase = await createClient();
    await supabase
      .from('organizer_sessions')
      .delete()
      .eq('session_token', sessionToken);
  }
  
  cookieStore.delete('organizer_session');
}

/**
 * Auth result for API routes
 */
export type AuthResult = 
  | {
      success: true;
      organizer: Organizer;
      role: 'founder' | 'co-organizer';
    }
  | {
      success: false;
      error: string;
      status: 401 | 403;
    };

/**
 * Require organizer with access to a specific event (for API routes)
 * Returns organizer and role if authorized, error details if not
 */
export async function requireEventAccess(eventId: string): Promise<AuthResult> {
  const organizer = await getOrganizer();
  
  if (!organizer) {
    return {
      success: false,
      error: 'Not authenticated',
      status: 401,
    };
  }
  
  const { hasAccess, role } = await checkEventAccess(organizer.id, eventId);
  
  if (!hasAccess || !role) {
    return {
      success: false,
      error: 'No access to this event',
      status: 403,
    };
  }
  
  return {
    success: true,
    organizer,
    role,
  };
}

/**
 * Require any authenticated organizer (for API routes)
 * Use this for routes that don't need event-specific access
 */
export async function requireAuth(): Promise<AuthResult> {
  const organizer = await getOrganizer();
  
  if (!organizer) {
    return {
      success: false,
      error: 'Not authenticated',
      status: 401,
    };
  }
  
  return {
    success: true,
    organizer,
    role: 'founder', // Default role when not event-specific
  };
}
