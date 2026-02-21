import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Cykelfesten <noreply@cykelfesten.se>';
// NOTE: The cykelfesten.se domain must be verified in Resend (DNS setup) before this sender will work.
const FROM_FALLBACK = 'Cykelfesten <onboarding@resend.dev>';

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const from = process.env.RESEND_FROM || FROM || FROM_FALLBACK;
  return resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
  });
}
