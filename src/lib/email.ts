import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use same verified domain as organizer emails (resend.ts)
const FROM = 'Cykelfesten <noreply@molt.isaksson.cc>';

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const from = process.env.RESEND_FROM_EMAIL || FROM;
  return resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
  });
}
