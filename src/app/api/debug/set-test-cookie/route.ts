import { NextResponse } from 'next/server';

// GET /api/debug/set-test-cookie
// Simple test to see if cookies can be set at all

export async function GET() {
  const testValue = 'test_' + Date.now();
  const cookieValue = `test_cookie=${testValue}; Path=/; Max-Age=3600; SameSite=Lax; Secure`;
  
  return new NextResponse(JSON.stringify({ 
    message: 'Cookie should be set',
    test_value: testValue,
    cookie_header: cookieValue,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieValue,
    },
  });
}
