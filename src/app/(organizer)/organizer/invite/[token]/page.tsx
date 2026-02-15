import { createAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage({ params }: Props) {
  const { token } = await params;
  const supabase = createAdminClient();
  
  // Find invite by token
  const { data: invite, error } = await supabase
    .from('event_organizers')
    .select(`
      *,
      event:events(id, name, event_date, city),
      inviter:organizers!event_organizers_organizer_id_fkey(name)
    `)
    .eq('invite_token', token)
    .is('removed_at', null)
    .single();
  
  if (error || !invite) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ogiltig länk</h1>
          <p className="text-gray-600 mb-6">
            Denna inbjudningslänk är inte giltig eller har redan använts.
          </p>
          <Link
            href="/login"
            className="text-indigo-600 hover:text-indigo-700"
          >
            Gå till inloggning →
          </Link>
        </div>
      </div>
    );
  }
  
  // Already accepted?
  if (invite.accepted_at) {
    redirect('/organizer');
  }
  
  const event = invite.event as any;
  const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900">Du är inbjuden!</h1>
        </div>
        
        <div className="bg-indigo-50 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{event.name}</h2>
          <p className="text-gray-600 capitalize">{eventDate}</p>
          {event.city && <p className="text-gray-500 text-sm">{event.city}</p>}
        </div>
        
        <p className="text-gray-600 text-center mb-6">
          Du har blivit inbjuden som <strong>medarrangör</strong>. 
          Logga in för att acceptera inbjudan.
        </p>
        
        <form action={`/api/organizer/accept-invite`} method="POST">
          <input type="hidden" name="token" value={token} />
          
          <Link
            href={`/login?redirect=/organizer/invite/${token}/accept`}
            className="block w-full bg-indigo-600 text-white py-4 rounded-lg font-semibold text-center hover:bg-indigo-700 transition-colors"
          >
            Logga in & acceptera →
          </Link>
        </form>
        
        <p className="text-center text-sm text-gray-500 mt-6">
          Du behöver logga in med samma e-post som inbjudan skickades till.
        </p>
      </div>
    </div>
  );
}
