import { sendWhatsAppMessage as legacySender } from '../whatsappSender'
import { supabase } from '../supabaseClient'

export type WhatsAppButton = {
  id: string
  title: string
}

export type SendMessageOptions = {
  to: string
  message: string
  from?: string // The bot's phone number
  buttons?: WhatsAppButton[]
  mediaUrl?: string
  mediaType?: 'image' | 'document' | 'audio'
}

/**
 * Modern WhatsApp Client wrapper for 11za
 * Handles credential lookup and advanced message types (buttons)
 */
export async function sendWhatsAppMessage(options: SendMessageOptions) {
  const { to, message, from, buttons, mediaUrl, mediaType } = options

  // 1. Resolve credentials
  let authToken = process.env.WHATSAPP_AUTH_TOKEN
  let origin = process.env.WHATSAPP_ORIGIN

  // Try to find the specific bot number, or fallback to ANY available number if 'from' is omitted
  let query = supabase.from('phone_document_mapping').select('auth_token, origin');
  if (from) {
      query = query.eq('phone_number', from);
  }
  
  const { data: mappings } = await query.limit(1)

  if (mappings && mappings.length > 0) {
    authToken = mappings[0].auth_token
    origin = mappings[0].origin
  }

  if (!authToken || !origin) {
    console.error('WhatsApp credentials not found. Tried finding for bot:', from || 'any')
    return { success: false, error: 'Credentials missing' }
  }

  // 2. Prepare payload for 11za
  // Note: 11za button API structure might vary, adjusting to common schema
  // We'll use the legacy sender for text and extend for others
  
  if (buttons && buttons.length > 0) {
    const payload = {
        sendto: to,
        authToken: authToken,
        originWebsite: origin,
        contentType: "button",
        buttonData: {
            title: message,
            buttons: buttons.map(b => ({ id: b.id, title: b.title }))
        }
    };
    
    const res = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return await res.json();
  }

  if (mediaUrl) {
    const payload = {
        sendto: to,
        authToken: authToken,
        originWebsite: origin,
        contentType: mediaType === 'document' ? 'document' : 'image',
        [mediaType === 'document' ? 'documentUrl' : 'imageUrl']: mediaUrl,
        caption: message
    };
    const res = await fetch("https://api.11za.in/apis/sendMessage/sendMessages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return await res.json();
  }

  return await legacySender(to, message, authToken, origin)
}
