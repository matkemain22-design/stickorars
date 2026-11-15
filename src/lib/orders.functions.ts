import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  order_type: z.enum(["upload", "custom"]),
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  sticker_shape: z.string().trim().max(40),
  width_cm: z.coerce.number().min(1).max(200),
  height_cm: z.coerce.number().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(100000),
  material: z.literal("Papir"),
  design_description: z.string().trim().max(3000).optional().default(""),
  note: z.string().trim().max(2000).optional().default(""),
});

const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml", "application/pdf", "image/webp", "application/postscript", "application/illustrator"];

export const submitOrder = createServerFn({ method: "POST" })
  .inputValidator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Neispravan zahtev");
    const fields = Object.fromEntries([...input.entries()].filter(([, v]) => typeof v === "string"));
    const data = schema.parse(fields);
    const file = input.get("design");
    const design = file instanceof File && file.size > 0 ? file : null;
    if (data.order_type === "upload") {
      if (!design) throw new Error("Morate ubaciti fajl sa dizajnom.");
      if (design.size > 20 * 1024 * 1024) throw new Error("Fajl je veći od 20MB.");
      const ext = design.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED.includes(design.type) && !["ai", "eps", "pdf", "svg", "png", "jpg", "jpeg", "webp"].includes(ext))
        throw new Error("Nepodržan format fajla.");
    } else if (data.design_description.length < 10) {
      throw new Error("Opišite dizajn koji želite (bar 10 karaktera).");
    }
    return { ...data, design };
  })
  .handler(async ({ data }) => {
    // Fail closed: external hosting must never fall back to Cloud storage.
    if (process.env["ORDERS_BACKEND_URL"] || process.env["ORDERS_BACKEND_MODE"] === "independent") {
      const { submitToIndependentBackend } = await import('./orders-backend.server');
      const form = new FormData();
      const { design, ...fields } = data;
      for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
      if (design && data.order_type === 'upload') form.set('design', design, design.name);
      return submitToIndependentBackend(form);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let design_path: string | null = null;
    if (data.order_type === "upload" && data.design) {
      const safe = data.design.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      design_path = `${crypto.randomUUID()}/${safe}`;
      const { error } = await supabaseAdmin.storage
        .from("designs")
        .upload(design_path, await data.design.arrayBuffer(), { contentType: data.design.type || "application/octet-stream" });
      if (error) throw new Error("Otpremanje fajla nije uspelo.");
    }
    const { design, ...rest } = data;
    const { data: row, error } = await supabaseAdmin
      .from("sticker_orders")
      .insert({ ...rest, design_path, phone: rest.phone || null, address: rest.address || null })
      .select("id, created_at")
      .single();
    if (error) throw new Error("Porudžbina nije sačuvana. Pokušajte ponovo.");

    // Sync to Google Drive (best-effort: order stays saved even if Drive fails)
    try {
      const { syncOrderToDrive } = await import("./drive.server");
      await syncOrderToDrive(
        { ...rest, id: row.id as string, created_at: row.created_at as string },
        design ? { name: design.name, type: design.type, buffer: await design.arrayBuffer() } : null
      );
    } catch (driveError) {
      console.error("Drive sync nije uspeo za porudžbinu", row.id, driveError);
    }

    return { id: row.id as string };
  });
