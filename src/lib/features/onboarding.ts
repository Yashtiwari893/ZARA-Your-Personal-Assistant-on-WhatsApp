import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { type Language } from '@/lib/whatsapp/templates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GET OR CREATE USER ───────────────────────────────────────
// Called at the start of every webhook request
export async function getOrCreateUser(phone: string) {
  // Try to find existing user
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single()

  if (existing) return existing

  // New user — create with defaults
  const { data: newUser } = await supabase
    .from('users')
    .insert({ phone, onboarded: false, language: 'en' })
    .select()
    .single()

  return newUser
}

// ─── ONBOARDING FLOW ──────────────────────────────────────────
export async function handleOnboarding(
  user: { id: string; phone: string; language: string; onboarded: boolean },
  incomingMessage: string,
  buttonId?: string
) {
  const phone = user.phone

  // Mark as onboarded immediately
  await supabase
    .from('users')
    .update({ onboarded: true })
    .eq('id', user.id)

  // Simple, text-only welcome message
  await sendWhatsAppMessage({
    to: phone,
    message: "Hey! 👋 I'm 11za - your personal assistant on WhatsApp.\n\nYou can send me reminders, grocery lists, or even documents, all in your language. How can I help you today?"
  })
}
