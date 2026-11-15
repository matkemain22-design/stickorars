import { formatOrder, orderNumber } from './schema.mjs';

const API = 'https://www.googleapis.com/drive/v3';

export function createDrive(config, request = fetch) {
  let cachedToken = null;
  let expiresAt = 0;
  async function token() {
    if (cachedToken && Date.now() < expiresAt) return cachedToken;
    const response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
        refresh_token: config.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Google OAuth [${response.status}]: ${await response.text()}`);
    const data = await response.json();
    if (!data.access_token) throw new Error('Google OAuth returned no access token');
    cachedToken = data.access_token;
    expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60000;
    return cachedToken;
  }

  async function call(url, init = {}) {
    const response = await request(url, { ...init,
      headers: { ...init.headers, Authorization: `Bearer ${await token()}` },
      signal: AbortSignal.timeout(90000) });
    if (!response.ok) {
      if (response.status === 401) cachedToken = null;
      throw new Error(`Google Drive [${response.status}]: ${await response.text()}`);
    }
    return response;
  }

  async function find(parentId, orderId, kind) {
    const escape = value => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `'${escape(parentId)}' in parents and trashed=false and appProperties has { key='stickoraOrderId' and value='${escape(orderId)}' } and appProperties has { key='stickoraKind' and value='${kind}' }`;
    const response = await call(`${API}/files?${new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' })}`);
    return (await response.json()).files?.[0]?.id ?? null;
  }

  async function folder(order) {
    const existing = await find(config.folderId, order.id, 'folder');
    if (existing) return existing;
    const response = await call(`${API}/files?supportsAllDrives=true`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orderNumber(order.id), mimeType: 'application/vnd.google-apps.folder',
        parents: [config.folderId], appProperties: { stickoraOrderId: order.id, stickoraKind: 'folder' } }),
    });
    return (await response.json()).id;
  }

  async function upload(parentId, order, kind, name, body, mimeType) {
    const existing = await find(parentId, order.id, kind);
    if (existing) return existing;
    const boundary = `stickora_${crypto.randomUUID()}`;
    const metadata = { name, parents: [parentId], appProperties: { stickoraOrderId: order.id, stickoraKind: kind } };
    const payload = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, body, `\r\n--${boundary}--\r\n`,
    ]);
    const response = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload,
    });
    return (await response.json()).id;
  }

  return {
    async sync(order, store) {
      const folderId = order.drive_folder_id || await folder(order);
      store.updateDrive(order.id, { drive_folder_id: folderId });
      if (!order.drive_info_id) {
        const id = await upload(folderId, order, 'info', 'podaci-porudzbine.txt', formatOrder(order), 'text/plain; charset=UTF-8');
        store.updateDrive(order.id, { drive_info_id: id });
      }
      if (order.design_path && !order.drive_design_id) {
        const content = await store.file(order);
        const id = await upload(folderId, order, 'design', order.design_name, content, order.design_type);
        store.updateDrive(order.id, { drive_design_id: id });
      }
      store.updateDrive(order.id, { drive_status: 'synced', drive_error: null, drive_next_at: null });
    },
  };
}

export function startDriveWorker(store, drive, intervalMs = 15000) {
  let busy = false;
  async function tick() {
    if (busy || !drive) return;
    const pending = store.pending();
    if (!pending) return;
    const order = store.get(pending.id);
    if (!order) return;
    busy = true;
    try { await drive.sync(order, store); }
    catch (error) {
      const attempts = order.drive_attempts + 1;
      const delay = Math.min(3600000, 15000 * 2 ** Math.min(attempts, 8));
      store.updateDrive(order.id, { drive_status: 'failed', drive_attempts: attempts,
        drive_error: String(error).slice(0, 2000), drive_next_at: new Date(Date.now() + delay).toISOString() });
      // Do not log OAuth response bodies: they can contain account details.
      console.error('Drive sync failed for order', order.id, 'attempt', attempts);
    } finally { busy = false; }
  }
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}