import * as React from 'react';

interface ParticipantWrapEmailProps {
  participantName: string;
  eventName: string;
  eventDate: string;
  wrapUrl: string;
  awardUrl?: string;
  hasAward: boolean;
  thankYouMessage?: string;
}

export function ParticipantWrapEmail({
  participantName,
  eventName,
  eventDate,
  wrapUrl,
  awardUrl,
  hasAward,
  thankYouMessage,
}: ParticipantWrapEmailProps) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '30px 0' }}>
        <h1 style={{ color: '#4f46e5', margin: '0' }}>🎉 Din Wrap är här!</h1>
        <p style={{ color: '#6b7280', margin: '10px 0 0 0' }}>{eventName} • {eventDate}</p>
      </div>
      
      <p>Hej {participantName}!</p>
      
      <p>
        Tack för en fantastisk kväll! Nu är din personliga wrap-sammanfattning redo. 
        Se tillbaka på kvällen, kolla statistik och få ditt diplom.
      </p>
      
      {thankYouMessage && (
        <div style={{ 
          background: '#fef3c7', 
          padding: '15px 20px', 
          borderRadius: '8px', 
          margin: '20px 0',
          borderLeft: '4px solid #f59e0b'
        }}>
          <p style={{ margin: 0, fontStyle: 'italic' }}>"{thankYouMessage}"</p>
          <p style={{ margin: '10px 0 0 0', fontSize: '14px', color: '#92400e' }}>– Arrangörerna</p>
        </div>
      )}
      
      <div style={{ textAlign: 'center', margin: '30px 0' }}>
        <a 
          href={wrapUrl}
          style={{
            display: 'inline-block',
            background: '#4f46e5',
            color: 'white',
            padding: '15px 30px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
            fontSize: '18px',
          }}
        >
          🎁 Öppna din Wrap
        </a>
      </div>
      
      {hasAward && awardUrl && (
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <p style={{ color: '#6b7280', marginBottom: '10px' }}>
            🏆 Du har även fått ett award!
          </p>
          <a 
            href={awardUrl}
            style={{
              display: 'inline-block',
              background: '#f59e0b',
              color: 'white',
              padding: '12px 25px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold',
            }}
          >
            Se ditt Award →
          </a>
        </div>
      )}
      
      <div style={{ 
        background: '#f3f4f6', 
        padding: '15px 20px', 
        borderRadius: '8px', 
        margin: '30px 0',
        textAlign: 'center'
      }}>
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
          💡 Tips: Ladda ner ditt diplom och dela på sociala medier!
        </p>
      </div>
      
      <p style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center' }}>
        Skickat från Cykelfesten • Du får detta mail för att du deltog i {eventName}
      </p>
    </div>
  );
}
