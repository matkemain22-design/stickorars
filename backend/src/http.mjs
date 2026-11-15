import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { orderSchema, validateFile, MAX_REQUEST_BYTES } from './schema.mjs';

export function authorized(header, token) {
  if (!token || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const candidate = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createApi(store, config) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return json(200, { ok: true, driveConfigured: Boolean(config.driveConfigured) });
      if (req.method === 'POST' && url.pathname === '/v1/orders') {
        if (!authorized(req.headers.authorization, config.ordersToken)) return json(401, { error: 'Pristup nije dozvoljen.' });
        if (!req.headers['content-type']?.startsWith('multipart/form-data;')) return json(415, { error: 'Očekivan je obrazac sa fajlom.' });
        if (Number(req.headers['content-length']) > MAX_REQUEST_BYTES) return json(413, { error: 'Fajl je veći od 20MB.' });
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > MAX_REQUEST_BYTES) { json(413, { error: 'Fajl je veći od 20MB.' }); return; }
          chunks.push(chunk);
        }
        let data, file;
        try {
          const request = new Request('http://localhost/v1/orders', { method: 'POST',
            headers: { 'Content-Type': req.headers['content-type'] }, body: Buffer.concat(chunks) });
          const form = await request.formData();
          data = orderSchema.parse(Object.fromEntries([...form].filter(([, value]) => typeof value === 'string')));
          file = validateFile(form.get('design'), data.order_type);
        } catch (error) {
          return json(400, { error: error?.name === 'ZodError' ? 'Proverite unete podatke.' : error.message });
        }
        const row = await store.save(data, file);
        return json(201, { id: row.id });
      }
      if (url.pathname.startsWith('/v1/admin/')) {
        if (!authorized(req.headers.authorization, config.adminToken)) return json(401, { error: 'Pristup nije dozvoljen.' });
        if (req.method === 'GET' && url.pathname === '/v1/admin/orders') {
          const limit = Number(url.searchParams.get('limit') ?? 50);
          const offset = Number(url.searchParams.get('offset') ?? 0);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return json(400, { error: 'Neispravna stranica.' });
          return json(200, { orders: store.list(limit, offset) });
        }
        const match = url.pathname.match(/^\/v1\/admin\/orders\/([0-9a-f-]{36})(?:\/(design|retry-drive))?$/i);
        if (!match) return json(404, { error: 'Nije pronađeno.' });
        const row = store.get(match[1]);
        if (!row) return json(404, { error: 'Nije pronađeno.' });
        if (req.method === 'GET' && !match[2]) return json(200, { order: row });
        if (req.method === 'GET' && match[2] === 'design') {
          const buffer = await store.file(row);
          if (!buffer) return json(404, { error: 'Nema fajla.' });
          res.writeHead(200, { 'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${row.design_name}"` });
          res.end(buffer); return;
        }
        if (req.method === 'POST' && match[2] === 'retry-drive') {
          store.updateDrive(row.id, { drive_status: 'pending', drive_next_at: null, drive_error: null });
          return json(202, { ok: true });
        }
      }
      return json(404, { error: 'Nije pronađeno.' });
    } catch {
      console.error('Order API request failed', req.method, url.pathname);
      if (!res.headersSent) json(500, { error: 'Porudžbina nije sačuvana. Pokušajte ponovo.' });
      else res.end();
    }
  });
}