// Proxy credentials never reach the browser.
export async function submitToIndependentBackend(form: FormData): Promise<{ id: string }> {
  const base = process.env['ORDERS_BACKEND_URL'];
  const token = process.env['ORDERS_API_TOKEN'];
  if (!base || !token) throw new Error('Sistem poručivanja nije podešen.');
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Adresa sistema poručivanja nije ispravna.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', 'orders'].includes(url.hostname)) throw new Error('Sistem poručivanja zahteva bezbednu vezu.');
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, '')}/v1/orders`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      signal: AbortSignal.timeout(90000), redirect: 'error',
    });
  } catch { throw new Error('Sistem poručivanja trenutno nije dostupan. Pokušajte ponovo kasnije.'); }
  if (!response.ok) {
    console.error('Independent orders service failed', response.status);
    if (response.status === 413) throw new Error('Fajl je veći od 20MB.');
    if (response.status === 400 || response.status === 415) throw new Error('Proverite unete podatke i fajl.');
    throw new Error('Porudžbina nije sačuvana. Pokušajte ponovo kasnije.');
  }
  const result = await response.json() as { id?: unknown };
  if (typeof result.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(result.id)) throw new Error('Sistem poručivanja nije vratio potvrdu.');
  return { id: result.id };
}