import * as React from 'react';

interface OrganizerReminderEmailProps {
  eventName: string;
  eventDate: string;
  adminUrl: string;
  funFactsUrl: string;
  missingFunFacts: number;
  totalCouples: number;
}

export function OrganizerReminderEmail({
  eventName,
  eventDate,
  adminUrl,
  funFactsUrl,
  missingFunFacts,
  totalCouples,
}: OrganizerReminderEmailProps) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#4f46e5' }}>🎉 Dags att avsluta {eventName}!</h1>
      
      <p>Hej arrangör!</p>
      
      <p>
        Eventet <strong>{eventName}</strong> ({eventDate}) är nu avslutat. 
        Innan vi skickar ut wrap-sammanfattningar till gästerna behöver du:
      </p>
      
      <div style={{ background: '#f3f4f6', padding: '20px', borderRadius: '8px', margin: '20px 0' }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>📝 Att göra:</h2>
        
        <div style={{ marginBottom: '15px' }}>
          <strong>1. Fyll i fun facts</strong>
          <p style={{ margin: '5px 0', color: '#6b7280' }}>
            {missingFunFacts > 0 
              ? `${missingFunFacts} av ${totalCouples} par saknar fun facts`
              : '✅ Alla par har fun facts!'
            }
          </p>
          <p style={{ margin: '5px 0' }}>
            Tips: "När gick sista gästen?", "Vem hade roligast keps?", "Bästa samtalsämnet?"
          </p>
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <strong>2. Granska wraps</strong>
          <p style={{ margin: '5px 0', color: '#6b7280' }}>
            Kolla att allt ser bra ut innan gästerna får sina.
          </p>
        </div>
        
        <div>
          <strong>3. Godkänn & skicka</strong>
          <p style={{ margin: '5px 0', color: '#6b7280' }}>
            När du är nöjd, klicka på "Godkänn & skicka wraps".
          </p>
        </div>
      </div>
      
      <div style={{ textAlign: 'center', margin: '30px 0' }}>
        <a 
          href={adminUrl}
          style={{
            display: 'inline-block',
            background: '#4f46e5',
            color: 'white',
            padding: '15px 30px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          Öppna Admin →
        </a>
      </div>
      
      <p style={{ color: '#6b7280', fontSize: '14px' }}>
        Detta mail skickades automatiskt från Cykelfesten. 
        Du kan ändra påminnelsetiden i admin-inställningarna.
      </p>
    </div>
  );
}
