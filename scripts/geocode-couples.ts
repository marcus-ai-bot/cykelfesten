/**
 * Backfill coordinates for couples that have an address but no coordinates.
 * Run with: npx tsx scripts/geocode-couples.ts
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kbqmjsohgnjlirdsnxyo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  // Fetch couples without coordinates
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/couples?coordinates=is.null&address=not.is.null&cancelled=not.eq.true&select=id,address,address_unit`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const couples = await res.json();
  console.log(`Found ${couples.length} couples without coordinates`);

  for (const couple of couples) {
    const addr = couple.address + (couple.address_unit ? `, ${couple.address_unit}` : '');
    console.log(`Geocoding: ${addr}`);

    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1&countrycodes=se`,
      { headers: { 'User-Agent': 'Cykelfesten/1.0 (marcus-ai@isaksson.cc)' } }
    );
    const geoData = await geoRes.json();

    if (geoData.length > 0) {
      const coords = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
      console.log(`  → ${coords.lat}, ${coords.lng}`);

      await fetch(`${SUPABASE_URL}/rest/v1/couples?id=eq.${couple.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ coordinates: coords }),
      });
    } else {
      console.log(`  → No results`);
    }

    // Nominatim rate limit: 1 req/sec
    await new Promise(r => setTimeout(r, 1100));
  }

  console.log('Done!');
}

main().catch(console.error);
