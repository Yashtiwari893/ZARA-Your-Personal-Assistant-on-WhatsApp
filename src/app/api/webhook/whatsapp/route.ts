import { NextRequest, NextResponse } from 'next/server'
import { classifyIntent } from '@/lib/ai/intent'
import { getOrCreateUser, handleOnboarding } from '@/lib/features/onboarding'
import {
  handleSetReminder,
  handleListReminders,
  handleSnoozeReminder,
  handleCancelReminder,
  handleReminderDone
} from '@/lib/features/reminder'
import {
  handleAddTask,
  handleListTasks,
  handleCompleteTask,
  handleListAllLists
} from '@/lib/features/task'
import {
  handleSaveDocument,
  handleFindDocument,
  handleListDocuments
} from '@/lib/features/document'
import { handleGetBriefing } from '@/lib/features/briefing'
import { helpMessage } from '@/lib/whatsapp/templates'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { speechToText } from '@/lib/speechToText'
import { generateAutoResponse } from '@/lib/autoResponder'
import { createClient } from '@supabase/supabase-js'
import type { Language } from '@/lib/whatsapp/templates'

// Use admin client in server contexts to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── 11ZA WEBHOOK PAYLOAD PARSER ──────────────────────────
function parseWebhookPayload(body: any) {
  return {
    phone: body?.from || '',
    to: body?.to || '',
    message: body?.content?.text || body?.content?.media?.caption || '',
    buttonId: body?.content?.button_id || null, // Hypothetical 11za button field
    mediaUrl: body?.content?.media?.url || null,
    mediaType: body?.content?.contentType || 'text', // text | audio | media
    subType: body?.content?.media?.type || null,  // voice | image | document
    messageId: body?.messageId || '',
    name: body?.whatsapp?.senderName || null,
    event: body?.event || 'MoMessage'
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('📩 WhatsApp Webhook Payload:', JSON.stringify(body, null, 2))

    const {
      phone, to, message, buttonId, mediaUrl, mediaType, subType, messageId, name, event
    } = parseWebhookPayload(body)

    if (!phone || !messageId) return NextResponse.json({ ok: true })

    // ── STEP 0.5: Get Bot Credentials (needed for media download) ───
    const { data: botCreds } = await supabaseAdmin
      .from('phone_document_mapping')
      .select('auth_token')
      .eq('phone_number', to)
      .limit(1)
    const authToken = botCreds?.[0]?.auth_token || process.env.ELEVEN_ZA_API_KEY;

    // ── STEP 0: Log Message History (Same as existing code) ─────
    const { error: logErr } = await supabaseAdmin.from("whatsapp_messages").insert([
      {
        message_id: messageId,
        channel: "whatsapp",
        from_number: phone,
        to_number: to,
        received_at: new Date().toISOString(),
        content_type: mediaType,
        content_text: message || null,
        sender_name: name,
        event_type: event,
        is_in_24_window: true,
        is_responded: false,
        raw_payload: body,
      },
    ]);

    if (logErr && (logErr as any).code === "23505") {
      console.log("ℹ️ Duplicate message ignored");
      return NextResponse.json({ ok: true });
    }

    // Only handle incoming user messages
    if (event !== 'MoMessage') return NextResponse.json({ ok: true })

    // ── STEP 1: Get or Create User ──────────────────────────────
    const user = await getOrCreateUser(phone)
    if (!user) return NextResponse.json({ ok: true })
    if (name && !user.name) {
      await supabaseAdmin.from('users').update({ name }).eq('id', user.id)
    }

    const lang = (user.language as Language) ?? 'en'

    // ── STEP 2: Onboarding Flow (Week 1) ──────────────────────
    if (!user.onboarded) {
      // Pass 'to' as the bot sender number
      await handleOnboarding(user, message, buttonId)
      return NextResponse.json({ ok: true })
    }


    // ── STEP 4: Handle Voice to Text (Existing Groq Whisper) ─────
    let processedMessage = message
    if (mediaType === 'media' && (subType === 'voice' || subType === 'audio') && mediaUrl) {
      const stt = await speechToText(mediaUrl, authToken)
      processedMessage = stt?.text || message
      console.log('🎙 Transcribed Voice:', processedMessage)
    }

    // ── STEP 5: Handle Media for Vault ─────────
    const isImageOrDoc = mediaType === 'image' || mediaType === 'document' || subType === 'image' || subType === 'document';
    if (mediaUrl && isImageOrDoc && subType !== 'voice' && subType !== 'audio') {
      await handleSaveDocument({
        userId: user.id,
        phone,
        language: lang,
        mediaUrl: mediaUrl!,
        mediaType: subType === 'document' ? 'application/pdf' : 'image/jpeg',
        caption: processedMessage || undefined,
        authToken: authToken
      })
      return NextResponse.json({ ok: true })
    }

    if (!processedMessage?.trim()) return NextResponse.json({ ok: true })

    // Session check — koi pending action hai?
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('context')
      .eq('user_id', user.id)
      .single()

    const ctx = session?.context as any

    if (ctx?.pending_action === 'awaiting_label') {
      // User ka next message = label hai
      const label = processedMessage.trim()

      // Document ka label update karo
      await supabaseAdmin.from('documents')
        .update({ label })
        .eq('storage_path', ctx.document_path)
        .eq('user_id', user.id)

      // Pending state clear karo
      await supabaseAdmin.from('sessions')
        .update({ context: {} })
        .eq('user_id', user.id)

      await sendWhatsAppMessage({
        to: phone,
        message: lang === 'hi'
          ? `📁 *${label}* ke naam se save ho gaya!\n\n_"${label} dikhao" bolke wapas paa sakte ho._`
          : `📁 Saved as *${label}*!\n\nYou can retrieve it by saying "show ${label}".`
      })

      return NextResponse.json({ ok: true })
    }

    // ── STEP 6: Intent Classification (Groq LPU) ─────────────
    const result = await classifyIntent(processedMessage, lang)
    const { intent, extractedData } = result
    console.log('🔍 Extracted Intent:', intent, extractedData)

    // ── STEP 7: Switchboard ────────────────────────────────────
    switch (intent) {
      case 'SET_REMINDER':
        await handleSetReminder({
          userId: user.id, phone, language: lang,
          message: processedMessage,
          dateTimeText: extractedData.dateTimeText,
          reminderTitle: extractedData.reminderTitle
        })
        break

      case 'LIST_REMINDERS':
        await handleListReminders({ userId: user.id, phone, language: lang })
        break

      case 'CANCEL_REMINDER':
        await handleListReminders({ userId: user.id, phone, language: lang }) // Show list first
        break

      case 'SNOOZE_REMINDER':
        await handleSnoozeReminder({
          userId: user.id,
          phone,
          language: lang,
          customText: extractedData.dateTimeText ?? processedMessage
        })
        break

      case 'ADD_TASK':
        await handleAddTask({
          userId: user.id, phone, language: lang,
          taskContent: extractedData.taskContent ?? processedMessage,
          listName: extractedData.listName ?? 'general'
        })
        break

      case 'LIST_TASKS':
        if (extractedData.listName) {
          await handleListTasks({ userId: user.id, phone, language: lang, listName: extractedData.listName })
        } else {
          await handleListAllLists({ userId: user.id, phone, language: lang })
        }
        break

      case 'COMPLETE_TASK':
        await handleCompleteTask({
          userId: user.id, phone, language: lang,
          taskContent: extractedData.taskContent ?? processedMessage,
          listName: extractedData.listName
        })
        break

      case 'FIND_DOCUMENT':
        await handleFindDocument({
          userId: user.id, phone, language: lang,
          query: extractedData.documentQuery ?? processedMessage
        })
        break

      case 'LIST_DOCUMENTS':
        await handleListDocuments({ userId: user.id, phone, language: lang })
        break

      case 'GET_BRIEFING':
        await handleGetBriefing({ userId: user.id, phone, language: lang })
        break

      case 'HELP':
        await sendWhatsAppMessage({ to: phone, message: helpMessage(lang) })
        break

      case 'UNKNOWN':
      default:
        // ── STEP 8: Fallback to Existing RAG Chat Logic ───────
        console.log('🤖 Falling back to Existing RAG Chat Handler');
        await generateAutoResponse(phone, to, processedMessage, messageId);
        break
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('🔥 WEBHOOK_PROCESSING_ERROR:', err)
    return NextResponse.json({ ok: true }) // Silent fail for 11za
  }
}

// 11za verification (GET)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? 'ok')
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
