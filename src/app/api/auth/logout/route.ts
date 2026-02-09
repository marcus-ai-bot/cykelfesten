import { NextRequest, NextResponse } from 'next/server';
import { logout } from '@/lib/auth';

export async function GET(request: NextRequest) {
  await logout();
  // Use request URL to get correct host
  const url = new URL('/login', request.url);
  return NextResponse.redirect(url);
}
