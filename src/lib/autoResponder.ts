import { supabase } from "./supabaseClient";
import { sendWhatsAppMessage } from "./whatsappSender";
import Groq from "groq-sdk";

/* ---------------- GROQ ---------------- */

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

/* ---------------- TYPES ---------------- */

export type AutoResponseResult = {
    success: boolean;
    response?: string;
    error?: string;
    noDocuments?: boolean;
    sent?: boolean;
};

/* ---------------- HELPERS ---------------- */

function normalizePhone(num: string): string {
    return num.replace(/\D/g, "");
}

function safeString(val: unknown): string {
    return typeof val === "string" ? val : "";
}

/* ---------------- MAIN ---------------- */

export async function generateAutoResponse(
    fromNumber: string,
    toNumber: string,
    messageText: string,
    messageId: string
): Promise<AutoResponseResult> {
    try {
        console.log("🚀 Auto responder triggered");

        const cleanFrom = normalizePhone(fromNumber);
        const cleanTo = normalizePhone(toNumber);

        console.log("🔎 Phone lookup", { cleanFrom, cleanTo });

        /* 2️⃣ PHONE CONFIG */
        let systemPromptBase = ""
        let auth_token = process.env.WHATSAPP_AUTH_TOKEN || ""
        let origin = process.env.WHATSAPP_ORIGIN || ""

        // Try exact match first
        let query = supabase.from("phone_document_mapping")
            .select("system_prompt, intent, auth_token, origin")
            .eq("phone_number", cleanTo)
            .limit(1);
            
        let { data: phoneMappings } = await query;

        // Fallback to any mapping if exact match fails
        if (!phoneMappings || phoneMappings.length === 0) {
            const { data: fallbackMappings } = await supabase.from("phone_document_mapping")
                .select("system_prompt, intent, auth_token, origin")
                .limit(1);
            phoneMappings = fallbackMappings;
        }

        if (phoneMappings && phoneMappings.length > 0) {
            const mapping = phoneMappings[0];
            systemPromptBase = safeString(mapping.system_prompt) || systemPromptBase;
            auth_token = safeString(mapping.auth_token) || auth_token;
            origin = safeString(mapping.origin) || origin;
        }

        if (!auth_token || !origin) {
            console.error("❌ WhatsApp API credentials missing");
            return {
                success: false,
                error: "WhatsApp API credentials missing for auto-responder",
            };
        }

        /* 3️⃣ USER MESSAGE */
        const userText = safeString(messageText).trim();
        if (!userText) {
            return { success: false, error: "Empty message" };
        }

        /* 4️⃣ HISTORY */
        const { data: historyRows } = await supabase
            .from("whatsapp_messages")
            .select("content_text, event_type")
            .or(`from_number.eq.${cleanFrom},to_number.eq.${cleanFrom}`)
            .order("received_at", { ascending: true })
            .limit(20);

        const history =
            historyRows?.filter(
                m =>
                    typeof m.content_text === "string" &&
                    (m.event_type === "MoMessage" || m.event_type === "MtMessage")
            ).map(m => ({
                role: m.event_type === "MoMessage" ? "user" as const : "assistant" as const,
                content: m.content_text,
            })) ?? [];

        /* 5️⃣ SYSTEM PROMPT */
        const documentRules = `
You are 11za, a smart and friendly personal assistant on WhatsApp.

STRICT RULES:
- Act like a human friend
- Answer general knowledge questions naturally (Weather, recipes, general facts)
- Keep replies short, conversational, and WhatsApp-style (1-3 lines max)
- Reply in the language the user is speaking (e.g. Hindi, Hinglish, English)
`.trim();

        const systemPrompt = systemPromptBase
            ? `${systemPromptBase}\n\n${documentRules}`
            : `${documentRules}`;

        const messages = [
            {
                role: "system" as const,
                content: systemPrompt,
            },
            ...history.slice(-10),
            { role: "user" as const, content: userText },
        ];

        /* 8️⃣ LLM */
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            temperature: 0.2,
            max_tokens: 300,
        });

        const reply = completion.choices[0]?.message?.content?.trim();
        if (!reply) {
            return { success: false, error: "Empty AI response" };
        }

        /* 9️⃣ SEND WHATSAPP */
        const sendResult = await sendWhatsAppMessage(
            cleanFrom,
            reply,
            auth_token,
            origin
        );

        if (!sendResult.success) {
            console.error("❌ WhatsApp send failed:", sendResult.error);
            return {
                success: false,
                response: reply,
                sent: false,
                error: "WhatsApp send failed",
            };
        }

        /* 🔟 SAVE BOT MESSAGE */
        const botMessageId = `auto_${messageId}_${Date.now()}`;

        await supabase.from("whatsapp_messages").insert({
            message_id: botMessageId,
            channel: "whatsapp",
            from_number: cleanTo,
            to_number: cleanFrom,
            received_at: new Date().toISOString(),
            content_type: "text",
            content_text: reply,
            sender_name: "AI Assistant",
            event_type: "MtMessage",
            is_in_24_window: true,
        });

        /* 11️⃣ MARK ORIGINAL AS RESPONDED */
        await supabase
            .from("whatsapp_messages")
            .update({
                is_responded: true,
                response_sent_at: new Date().toISOString(),
            })
            .eq("message_id", messageId);

        console.log("✅ Auto-response sent successfully");

        return {
            success: true,
            response: reply,
            sent: true,
        };
    } catch (err) {
        console.error("🔥 Auto-response error:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        };
    }
}
