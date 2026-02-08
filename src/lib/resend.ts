import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY not set - email functionality disabled');
}

export const resend = new Resend(process.env.RESEND_API_KEY);

// Default from address - using verified molt.isaksson.cc subdomain
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Cykelfesten <noreply@molt.isaksson.cc>';

// Base URL for links in emails
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://cykelfesten.vercel.app';
