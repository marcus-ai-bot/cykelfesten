import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';

// PATCH /api/organizer/profile
// Update organizer profile

export async function PATCH(request: NextRequest) {
  try {
    const organizer = await getOrganizer();
    
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    
    const { name, phone } = await request.json();
    
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('organizers')
      .update({ 
        name: name?.trim() || null,
        phone: phone?.trim() || null,
      })
      .eq('id', organizer.id);
    
    if (error) {
      console.error('Profile update error:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/organizer/profile
// Get current organizer profile

export async function GET() {
  const organizer = await getOrganizer();
  
  if (!organizer) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }
  
  return NextResponse.json(organizer);
}
