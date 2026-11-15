import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.mjs';
import { createApi } from '../src/http.mjs';
import { createDrive } from '../src/drive.mjs';
import { orderSchema, validateFile, orderNumber, formatOrder } from '../src/schema.mjs';

const input = { order_type: 'custom', full_name: 'Test Kupac', email: 'test@example.com',
  sticker_shape: 'Krug', width_cm: 5, height_cm: 5, quantity: 50, material: 'Papir',
  design_description: 'Logo za pakovanje' };

test('customer email remains required', () => {
  assert.equal(orderSchema.safeParse({ ...input, email: '' }).success, false);
  assert.equal(orderSchema.parse(input).email, 'test@example.com');
});
test('only paper is orderable', () => {
  for (const material of ['Vinil sjajni', 'Vinil mat', 'Providna folija']) assert.equal(orderSchema.safeParse({ ...input, material }).success, false);
  assert.equal(orderSchema.parse(input).material, 'Papir');
});
test('upload mode requires design file', () => {
  assert.throws(() => validateFile(null, 'upload'));
});
test('design files are limited to 20MB', () => {
  assert.throws(() => validateFile({ name: 'test.pdf', size: 20 * 1024 * 1024 + 1, arrayBuffer() {} }, 'upload'));
  assert.equal(validateFile({ name: 'test.pdf', size: 20 * 1024 * 1024, arrayBuffer() {} }, 'upload').size, 20971520);
});
test('manual design requests need at least 10 characters', () => {
  assert.equal(orderSchema.safeParse({ ...input, design_description: '123456789' }).success, false);
  assert.equal(orderSchema.safeParse({ ...input, design_description: '1234567890' }).success, true);
});
test('Drive folder matches customer order number and contact information survives formatting', () => {
  assert.equal(orderNumber('a788648d-1111-4111-8111-111111111111'), 'A788648D');
  const text = formatOrder({ ...input, id: 'a788648d-1111-4111-8111-111111111111', created_at: '2026-11-15' });
  assert.ok(text.includes('Email: test@example.com'));
});

test('authenticated HTTP order, private file readback, restart persistence and Drive retries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stickora-orders-'));
  let store = createStore(dir);
  const config = { ordersToken: 's'.repeat(64), adminToken: 'a'.repeat(64) };
  const api = createApi(store, config);
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${api.address().port}`;
  try {
    const unauthorized = await fetch(`${base}/v1/orders`, { method: 'POST' });
    assert.equal(unauthorized.status, 401);
    const fd = new FormData();
    for (const [key, value] of Object.entries({ ...input, order_type: 'upload' })) fd.set(key, String(value));
    fd.set('design', new File(['%PDF-1.4 test design'], 'design.pdf', { type: 'application/pdf' }));
    const response = await fetch(`${base}/v1/orders`, { method: 'POST', headers: { Authorization: `Bearer ${config.ordersToken}` }, body: fd });
    assert.equal(response.status, 201);
    const { id } = await response.json();
    assert.equal(store.get(id).drive_status, 'pending');
    assert.equal((await fetch(`${base}/v1/admin/orders/${id}`)).status, 401);
    assert.equal((await fetch(`${base}/v1/admin/orders/${id}`, { headers: { Authorization: `Bearer ${config.ordersToken}` } })).status, 401);
    const readback = await fetch(`${base}/v1/admin/orders/${id}`, { headers: { Authorization: `Bearer ${config.adminToken}` } });
    assert.equal((await readback.json()).order.email, input.email);
    const download = await fetch(`${base}/v1/admin/orders/${id}/design`, { headers: { Authorization: `Bearer ${config.adminToken}` } });
    assert.equal(await download.text(), '%PDF-1.4 test design');
    await new Promise(resolve => api.close(resolve));
    store.close(); store = createStore(dir);
    assert.equal(store.get(id).quantity, 50);
    assert.equal((await store.file(store.get(id))).toString(), '%PDF-1.4 test design');
    let folders = 0, uploads = 0;
    const google = async (url, init) => {
      if (url.includes('oauth2')) return Response.json({ access_token: 'test-token', expires_in: 3600 });
      if (init?.method === 'POST' && url.includes('/upload/')) {
        uploads++; return Response.json({ id: `file-${uploads}` });
      }
      if (init?.method === 'POST') {
        assert.equal(JSON.parse(init.body).name, orderNumber(id));
        folders++; return Response.json({ id: 'folder-test' });
      }
      return Response.json({ files: [] });
    };
    const drive = createDrive({ clientId: 'test', clientSecret: 'test', refreshToken: 'test', folderId: 'root' }, google);
    await drive.sync(store.get(id), store);
    await drive.sync(store.get(id), store);
    assert.equal(folders, 1);
    assert.equal(uploads, 2);
    assert.equal(store.get(id).drive_status, 'synced');
  } finally {
    if (api.listening) await new Promise(resolve => api.close(resolve));
    store.close(); await rm(dir, { recursive: true, force: true });
  }
});