import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { orderNumber } from './schema.mjs';

// Only this process accesses the SQLite DB; backup DB and private files together.
export function createStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filesDir = path.join(dataDir, 'designs');
  mkdirSync(filesDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'orders.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      data TEXT NOT NULL, design_path TEXT, design_name TEXT, design_type TEXT,
      status TEXT NOT NULL DEFAULT 'new', drive_status TEXT NOT NULL DEFAULT 'pending',
      drive_folder_id TEXT, drive_info_id TEXT, drive_design_id TEXT,
      drive_attempts INTEGER NOT NULL DEFAULT 0, drive_next_at TEXT,
      drive_error TEXT
    );`);

  function get(id) {
    const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    return row ? { ...JSON.parse(row.data), ...row, data: undefined } : null;
  }

  async function save(data, file, imported = {}) {
    const id = imported.id ?? crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid order UUID');
    if (get(id)) throw new Error('Order already exists');
    const created_at = imported.created_at ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(created_at))) throw new Error('Invalid order date');
    const name = file ? file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) : null;
    const relative = name ? `${id}/${name}` : null;
    if (file && relative) {
      await mkdir(path.join(filesDir, id), { recursive: true, mode: 0o700 });
      await writeFile(path.join(filesDir, relative), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
    }
    try {
      db.prepare(`INSERT INTO orders (id,number,created_at,data,design_path,design_name,design_type,status)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, orderNumber(id), created_at, JSON.stringify(data), relative,
        name, file?.type || 'application/octet-stream', imported.status ?? 'new');
    } catch (error) {
      await rm(path.join(filesDir, id), { recursive: true, force: true });
      throw error;
    }
    return get(id);
  }

  function updateDrive(id, fields) {
    const allowed = ['drive_status', 'drive_folder_id', 'drive_info_id', 'drive_design_id', 'drive_attempts', 'drive_next_at', 'drive_error'];
    const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
    if (!entries.length) return;
    db.prepare(`UPDATE orders SET ${entries.map(([key]) => `${key}=?`).join(',')} WHERE id=?`)
      .run(...entries.map(([, value]) => value), id);
  }

  return {
    save, get, updateDrive,
    list: (limit = 50, offset = 0) => db.prepare('SELECT id FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset).map(row => get(row.id)),
    pending: () => db.prepare(`SELECT id FROM orders WHERE drive_status != 'synced'
      AND (drive_next_at IS NULL OR drive_next_at <= ?) ORDER BY created_at LIMIT 1`).get(new Date().toISOString()),
    file: async (order) => {
      if (!order.design_path) return null;
      const resolved = path.resolve(filesDir, order.design_path);
      if (!resolved.startsWith(path.resolve(filesDir) + path.sep)) throw new Error('Invalid file path');
      return readFile(resolved);
    },
    close: () => db.close(),
  };
}