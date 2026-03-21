import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import {
  welcomeMessage, welcomeButtons,
  termsMessage, termsButtons,
  onboardingComplete,
  type Language
} from '@/lib/whatsapp/templates'

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
// State machine: step 1 = language, step 2 = T&C, step 3 = done
export async function handleOnboarding(
  user: { id: string; phone: string; language: string; onboarded: boolean },
  incomingMessage: string,
  buttonId?: string
) {
  const phone = user.phone

  // STEP 1: No language set yet → send language picker
  if (!buttonId && !incomingMessage.startsWith('lang_') && !incomingMessage.startsWith('terms_')) {
    await sendWhatsAppMessage({
      to: phone,
      message: welcomeMessage(),
      buttons: welcomeButtons()
    })
    return
  }

  // STEP 2: Language selected
  if (buttonId?.startsWith('lang_') || incomingMessage.startsWith('lang_')) {
    const langCode = (buttonId ?? incomingMessage).replace('lang_', '') as Language
    const validLangs: Language[] = ['en', 'hi', 'gu']
    const lang = validLangs.includes(langCode) ? langCode : 'en'

    // Save language
    await supabase.from('users').update({ language: lang }).eq('id', user.id)

    // Send T&C
    await sendWhatsAppMessage({
      to: phone,
      message: termsMessage(lang),
      buttons: termsButtons(lang)
    })
    return
  }

  // STEP 3: T&C accepted
  if (buttonId === 'terms_accept' || incomingMessage === 'terms_accept') {
    const lang = (user.language as Language) ?? 'en'

    // Mark as onboarded
    await supabase
      .from('users')
      .update({ onboarded: true })
      .eq('id', user.id)

    // Welcome message
    await sendWhatsAppMessage({
      to: phone,
      message: onboardingComplete('there', lang)
    })
    return
  }

  // T&C view policies
  if (buttonId === 'terms_view') {
    await sendWhatsAppMessage({
      to: phone,
      message: `📄 Privacy Policy: https://yourapp.com/privacy\n📄 Terms of Use: https://yourapp.com/terms`
    })
    return
  }

  // Fallback — show welcome again
  await sendWhatsAppMessage({
    to: phone,
    message: welcomeMessage(),
    buttons: welcomeButtons()
  })
}
