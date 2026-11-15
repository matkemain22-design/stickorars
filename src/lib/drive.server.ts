// Google Drive sync for sticker orders (server-only).
// Uses the connector gateway; credentials are read inside functions, never at module scope.

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function authHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !driveKey) throw new Error("Drive konekcija nije podešena.");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": driveKey,
  };
}

async function driveFetch(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive greška [${res.status}]: ${body}`);
  }
  return res;
}

async function findFolder(name: string, parentId?: string): Promise<string | null> {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const res = await driveFetch(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    method: "GET",
  });
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const res = await driveFetch("/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function ensureFolder(name: string, parentId?: string): Promise<string> {
  return (await findFolder(name, parentId)) ?? (await createFolder(name, parentId));
}

async function uploadFile(
  name: string,
  parentId: string,
  content: Blob | string,
  mimeType: string
): Promise<string> {
  const boundary = `stickora_${crypto.randomUUID().replace(/-/g, "")}`;
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const mediaBlob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const head = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const payload = new Blob([metaPart, head, mediaBlob, tail]);
  const res = await fetch(
    `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
      body: payload,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload greška [${res.status}]: ${text}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export interface OrderForDrive {
  id: string;
  order_type: "upload" | "custom";
  full_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  sticker_shape: string;
  width_cm: number;
  height_cm: number;
  quantity: number;
  material: string;
  design_description: string;
  note: string;
  created_at?: string;
}

export async function syncOrderToDrive(
  order: OrderForDrive,
  design: { name: string; type: string; buffer: ArrayBuffer } | null
): Promise<void> {
  const rootId = await ensureFolder("Stickora porudžbine");
  const date = (order.created_at ?? new Date().toISOString()).slice(0, 10);
  const orderNumber = order.id.slice(0, 8).toUpperCase();
  const orderFolderId = await createFolder(orderNumber, rootId);

  const info = [
    "STICKORA.RS — NOVA PORUDŽBINA",
    "================================",
    `Broj porudžbine: ${orderNumber}`,
    `ID: ${order.id}`,
    `Datum: ${date}`,
    "",
    "KUPAC",
    `Ime i prezime: ${order.full_name}`,
    `Email: ${order.email}`,
    `Telefon: ${order.phone || "-"}`,
    `Adresa: ${order.address || "-"}`,
    "",
    "PORUDŽBINA",
    `Tip: ${order.order_type === "upload" ? "Kupac ima svoj dizajn" : "Traži izradu dizajna"}`,
    `Oblik: ${order.sticker_shape}`,
    `Dimenzije: ${order.width_cm} x ${order.height_cm} cm`,
    `Količina: ${order.quantity}`,
    `Materijal: ${order.material}`,
    "",
    "OPIS DIZAJNA / ZAHTEV",
    order.design_description || "-",
    "",
    "NAPOMENA",
    order.note || "-",
  ].join("\n");

  await uploadFile("podaci-porudzbine.txt", orderFolderId, info, "text/plain; charset=UTF-8");

  if (design) {
    await uploadFile(
      design.name,
      orderFolderId,
      new Blob([design.buffer], { type: design.type || "application/octet-stream" }),
      design.type || "application/octet-stream"
    );
  }
}
