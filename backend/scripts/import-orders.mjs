import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStore } from '../src/store.mjs';
import { orderSchema, validateFile } from '../src/schema.mjs';

// Offline import: run on the host with the service stopped. Never needs Cloud credentials.
const [jsonPath, designsPath] = process.argv.slice(2);
if (!jsonPath || !designsPath) throw new Error('Usage: npm run import -- orders.json /path/to/designs');
const rows = JSON.parse(await readFile(jsonPath, 'utf8'));
if (!Array.isArray(rows)) throw new Error('Expected a JSON array of exported orders');
const store = createStore(path.resolve(process.env.DATA_DIR ?? './data'));
let imported = 0;
try {
  for (const row of rows) {
    if (store.get(row.id)) continue;
    const data = orderSchema.parse({ ...row, phone: row.phone ?? '', address: row.address ?? '',
      design_description: row.design_description ?? '', note: row.note ?? '' });
    let file = null;
    if (data.order_type === 'upload') {
      if (!row.design_path) throw new Error(`Missing design_path for order ${row.id}`);
      const root = path.resolve(designsPath);
      const location = path.resolve(root, row.design_path);
      if (!location.startsWith(root + path.sep)) throw new Error('Invalid design_path');
      const name = path.basename(location);
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
        svg: 'image/svg+xml', pdf: 'application/pdf', ai: 'application/illustrator', eps: 'application/postscript' };
      file = new File([await readFile(location)], name, { type: mime[name.split('.').pop()?.toLowerCase()] ?? 'application/octet-stream' });
      validateFile(file, 'upload');
    }
    await store.save(data, file, { id: row.id, created_at: row.created_at, status: row.status ?? 'new' });
    imported++;
  }
  console.log(`Imported ${imported} orders; IDs preserved. Drive sync queued.`);
} finally { store.close(); }