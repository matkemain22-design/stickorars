import path from 'node:path';
import { createStore } from './store.mjs';
import { createApi } from './http.mjs';
import { createDrive, startDriveWorker } from './drive.mjs';

const ordersToken = process.env.ORDERS_API_TOKEN;
const adminToken = process.env.ADMIN_API_TOKEN;
if (!ordersToken || !adminToken || ordersToken.length < 32 || adminToken.length < 32 || ordersToken === adminToken) {
  throw new Error('Set different ORDERS_API_TOKEN and ADMIN_API_TOKEN, each at least 32 characters.');
}
const google = {
  clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN, folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
};
const values = Object.values(google).filter(Boolean);
if (values.length && values.length !== 4) throw new Error('Set all four Google Drive environment variables or leave all blank.');
const store = createStore(path.resolve(process.env.DATA_DIR ?? './data'));
const drive = values.length === 4 ? createDrive(google) : null;
if (!drive) console.warn('Google Drive not configured; orders and files are saved, sync stays pending.');
const stopWorker = startDriveWorker(store, drive);
const server = createApi(store, { ordersToken, adminToken, driveConfigured: Boolean(drive) });
server.requestTimeout = 120000;
server.headersTimeout = 30000;
server.listen(Number(process.env.PORT ?? 4000), '0.0.0.0', () => console.log('Stickora orders service ready'));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopWorker();
    server.close(() => process.exit(0));
    // Any interrupted Drive job remains in the DB and resumes after restart.
    setTimeout(() => process.exit(0), 10000).unref();
  });
}