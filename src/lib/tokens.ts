import { createHmac } from 'crypto';

/**
 * Signed tokens for secure couple/person identification
 * 
 * Format: coupleId:personType:timestamp:signature
 * - coupleId: UUID of the couple
 * - personType: 'invited' | 'partner'
 * - timestamp: Unix timestamp (for expiry check)
 * - signature: HMAC-SHA256 of the above
 */

const TOKEN_SECRET = process.env.TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-dev-secret';
const TOKEN_EXPIRY_DAYS = 30; // Tokens valid for 30 days

function sign(data: string): string {
  return createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for shorter URLs
}

export interface TokenPayload {
  coupleId: string;
  personType: 'invited' | 'partner';
  timestamp: number;
}

/**
 * Create a signed token for a couple/person
 */
export function createToken(coupleId: string, personType: 'invited' | 'partner' = 'invited'): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${coupleId}:${personType}:${timestamp}`;
  const signature = sign(data);
  
  // Base64url encode for URL safety
  const token = Buffer.from(`${data}:${signature}`).toString('base64url');
  return token;
}

/**
 * Verify and decode a signed token
 * Returns null if invalid or expired
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    // Decode base64url
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    
    if (parts.length !== 4) {
      console.log('Token invalid: wrong number of parts');
      return null;
    }
    
    const [coupleId, personType, timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    
    // Verify signature
    const data = `${coupleId}:${personType}:${timestamp}`;
    const expectedSignature = sign(data);
    
    if (signature !== expectedSignature) {
      console.log('Token invalid: signature mismatch');
      return null;
    }
    
    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    const expirySeconds = TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
    
    if (now - timestamp > expirySeconds) {
      console.log('Token expired');
      return null;
    }
    
    // Validate personType
    if (personType !== 'invited' && personType !== 'partner') {
      console.log('Token invalid: bad personType');
      return null;
    }
    
    return {
      coupleId,
      personType: personType as 'invited' | 'partner',
      timestamp,
    };
  } catch (error) {
    console.log('Token decode error:', error);
    return null;
  }
}

/**
 * Get coupleId and personType from either:
 * 1. Signed token (preferred)
 * 2. Raw coupleId + person param (legacy, for backward compat during migration)
 * 
 * Returns null if neither works
 */
export function getAccessFromParams(
  searchParams: URLSearchParams
): { coupleId: string; personType: 'invited' | 'partner' } | null {
  // Try signed token first
  const token = searchParams.get('token');
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      return {
        coupleId: payload.coupleId,
        personType: payload.personType,
      };
    }
  }
  
  // Fall back to raw params (legacy support)
  // TODO: Remove this after migration period
  const coupleId = searchParams.get('coupleId');
  const person = searchParams.get('person');
  
  if (coupleId) {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(coupleId)) {
      return null;
    }
    
    return {
      coupleId,
      personType: person === 'partner' ? 'partner' : 'invited',
    };
  }
  
  return null;
}

/**
 * Build URL with signed token
 */
export function buildTokenUrl(baseUrl: string, coupleId: string, personType: 'invited' | 'partner' = 'invited'): string {
  const token = createToken(coupleId, personType);
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Create a deterministic invite token for an event.
 * Always returns the same token for the same eventId — no expiry.
 * Used to create shareable registration links.
 */
export function createInviteToken(eventId: string): string {
  return createHmac('sha256', TOKEN_SECRET)
    .update(`invite:${eventId}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Verify an invite token for an event.
 */
export function verifyInviteToken(eventId: string, token: string): boolean {
  return createInviteToken(eventId) === token;
}
