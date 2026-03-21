import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { documentSaved, documentNotFound, errorMessage, type Language } from '@/lib/whatsapp/templates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── SAVE DOCUMENT (called when user sends image/PDF) ──────────
export async function handleSaveDocument(params: {
  userId: string
  phone: string
  language: Language
  mediaUrl: string       
  mediaType: string      
  caption?: string       
}) {
  const { userId, phone, language, mediaUrl, mediaType, caption } = params

  const mediaBuffer = await downloadMedia(mediaUrl)
  if (!mediaBuffer) {
    console.error('downloadMedia failed for URL:', mediaUrl)
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  const label = caption?.trim() || guessLabel(mediaType)
  const ext   = mediaType.includes('pdf') ? 'pdf' : 'jpg'
  const path  = `${userId}/${Date.now()}_${label.replace(/\s+/g, '_')}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('documents')        
    .upload(path, mediaBuffer, { contentType: mediaType, upsert: false })

  if (uploadErr) {
    console.error('[document] Upload failed:', uploadErr)
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  const { error: dbErr } = await supabase.from('documents').insert({
    user_id:      userId,
    label,
    storage_path: path,
    doc_type:     mediaType.includes('pdf') ? 'pdf' : 'image',
    mime_type:    mediaType,
    file_size:    mediaBuffer.length,
  })

  if (dbErr) {
    console.error('[document] DB insert failed:', dbErr)
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  if (!caption) {
    await sendWhatsAppMessage({
      to: phone,
      message: language === 'hi'
        ? `📁 Document save ho gaya!\n\nIse kya naam du? (jaise "aadhar", "passport") Reply karo.`
        : `📁 Document saved!\n\nWhat should I call this? (e.g. "aadhar", "passport") Reply with a name.`
    })
    return
  }

  await sendWhatsAppMessage({
    to: phone,
    message: documentSaved(label, language)
  })
}

// ─── FIND DOCUMENT ────────────────────────────────────────────
export async function handleFindDocument(params: {
  userId: string
  phone: string
  language: Language
  query: string
}) {
  const { userId, phone, language, query } = params

  const { data: results, error } = await supabase.rpc('search_documents', {
    p_user_id: userId,
    p_query:   query
  })

  if (error || !results || results.length === 0) {
    await sendWhatsAppMessage({
      to: phone,
      message: documentNotFound(query, language)
    })
    return
  }

  const doc = results[0]

  const { data: signedData } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 900)  

  if (!signedData?.signedUrl) {
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  await sendWhatsAppMessage({
    to: phone,
    message: language === 'hi'
      ? `📁 *${doc.label}* mila!\n\nNiche link hai (15 min ke liye valid):`
      : `📁 Found *${doc.label}*!\n\nHere's your document (valid for 15 min):`,
    mediaUrl: signedData.signedUrl,
    mediaType: doc.doc_type === 'pdf' ? 'document' : 'image'
  })
}

// ─── LIST ALL DOCUMENTS ───────────────────────────────────────
export async function handleListDocuments(params: {
  userId: string
  phone: string
  language: Language
}) {
  const { userId, phone, language } = params

  const { data: docs } = await supabase
    .from('documents')
    .select('label, doc_type, uploaded_at')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
    .limit(20)

  if (!docs || docs.length === 0) {
    await sendWhatsAppMessage({
      to: phone,
      message: language === 'hi'
        ? '📭 Abhi koi document save nahi hai. Koi bhi photo ya PDF bhejo!'
        : '📭 No documents saved yet. Send me any photo or PDF!'
    })
    return
  }

  const docList = docs.map(d => `• *${d.label}* (${d.doc_type})`).join('\n')
  await sendWhatsAppMessage({
    to: phone,
    message: (language === 'hi' ? `📁 *Aapke Documents:*\n\n` : `📁 *Your Documents:*\n\n`) + 
             `${docList}\n\n` + 
             (language === 'hi' ? `_Wapas pane ke liye naam bolo._` : `_Say a document name to retrieve it._`)
  })
}

// ─── HELPERS ──────────────────────────────────────────────────
async function downloadMedia(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    return null
  }
}

function guessLabel(mediaType: string): string {
  if (mediaType.includes('pdf')) return 'document'
  if (mediaType.includes('image')) return 'photo'
  return 'file'
}
