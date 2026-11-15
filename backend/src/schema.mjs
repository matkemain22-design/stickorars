import { z } from 'zod';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 512 * 1024;
export const orderNumber = (id) => id.slice(0, 8).toUpperCase();

export const orderSchema = z.object({
  order_type: z.enum(['upload', 'custom']),
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  sticker_shape: z.enum(['Krug', 'Kvadrat', 'Pravougaonik', 'Ovalna', 'Po konturi (die-cut)']),
  width_cm: z.coerce.number().min(1).max(200),
  height_cm: z.coerce.number().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(100000),
  material: z.literal('Papir'),
  design_description: z.string().trim().max(3000).optional().default(''),
  note: z.string().trim().max(2000).optional().default(''),
}).superRefine((data, ctx) => {
  if (data.order_type === 'custom' && data.design_description.length < 10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Opišite dizajn koji želite (bar 10 karaktera).' });
  }
});

export function validateFile(file, type) {
  if (type === 'custom') return null;
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) {
    throw new Error('Morate ubaciti fajl sa dizajnom.');
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('Fajl je veći od 20MB.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps'].includes(ext)) {
    throw new Error('Nepodržan format fajla.');
  }
  return file;
}

export function formatOrder(order) {
  return [
    'STICKORA.RS — NOVA PORUDŽBINA', '================================',
    `Broj porudžbine: ${orderNumber(order.id)}`, `ID: ${order.id}`, `Datum: ${order.created_at}`,
    '', 'KUPAC', `Ime i prezime: ${order.full_name}`, `Email: ${order.email}`,
    `Telefon: ${order.phone || '-'}`, `Adresa: ${order.address || '-'}`,
    '', 'PORUDŽBINA', `Tip: ${order.order_type === 'upload' ? 'Kupac ima svoj dizajn' : 'Traži izradu dizajna'}`,
    `Oblik: ${order.sticker_shape}`, `Dimenzije: ${order.width_cm} x ${order.height_cm} cm`,
    `Količina: ${order.quantity}`, `Materijal: ${order.material}`,
    '', 'OPIS DIZAJNA / ZAHTEV', order.design_description || '-', '', 'NAPOMENA', order.note || '-',
  ].join('\n');
}