import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const ALLOWED_SERVICES = ["woocommerce", "ebay", "amazon"];

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("connection_settings")
    .select("service, config, updated_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { service, config } = body as { service: string; config: object };

  if (!ALLOWED_SERVICES.includes(service)) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("connection_settings")
    .upsert({ service, config, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
