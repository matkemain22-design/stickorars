CREATE TABLE public.sticker_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  order_type text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  address text,
  sticker_shape text,
  width_cm numeric,
  height_cm numeric,
  quantity integer NOT NULL DEFAULT 1,
  material text,
  design_path text,
  design_description text,
  note text,
  status text NOT NULL DEFAULT 'novo'
);
GRANT ALL ON public.sticker_orders TO service_role;
ALTER TABLE public.sticker_orders ENABLE ROW LEVEL SECURITY;