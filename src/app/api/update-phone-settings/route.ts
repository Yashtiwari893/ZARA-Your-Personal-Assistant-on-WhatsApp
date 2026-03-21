import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone_number, intent, system_prompt, auth_token, origin } = body;

    if (!phone_number) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    console.log("Upserting phone settings for:", phone_number);

    // ─── UPSERT LOGIC (Works with or without file_id) ─────────
    const { error: upsertError } = await supabase
      .from("phone_document_mapping")
      .upsert({
        phone_number,
        intent: intent ?? null,
        system_prompt: system_prompt ?? null,
        auth_token: auth_token ?? null,
        origin: origin ?? null
        // Note: file_id is omitted so it uses the DEFAULT (null) or keeps existing
      }, { onConflict: "phone_number" });

    if (upsertError) {
      console.error("Supabase UPSERT error:", upsertError);
      throw upsertError;
    }

    return NextResponse.json({
      success: true,
      message: "Phone settings saved successfully",
    });

  } catch (error: any) {
    console.error("Update phone settings error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update phone settings" },
      { status: 500 }
    );
  }
}
