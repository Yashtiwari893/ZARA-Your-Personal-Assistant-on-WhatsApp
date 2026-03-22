import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
    try {
        // Get all phone configs
        const { data: mappings, error: mappingError } = await supabase
            .from("phone_document_mapping")
            .select(`
                id,
                phone_number,
                intent,
                system_prompt,
                auth_token,
                origin
            `)
            .order("phone_number", { ascending: true });

        if (mappingError) {
            throw mappingError;
        }

        return NextResponse.json({
            success: true,
            groups: mappings,
        });
    } catch (error) {
        console.error("Error fetching phone groups:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Failed to fetch phone groups",
            },
            { status: 500 }
        );
    }
}
