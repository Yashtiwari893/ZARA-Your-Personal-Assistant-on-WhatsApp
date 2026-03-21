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

  const msgLower = incomingMessage.toLowerCase().trim()
  
  // Natural language mapping
  let langSelect: Language | null = null
  if (buttonId?.startsWith('lang_') || msgLower.startsWith('lang_')) {
    langSelect = (buttonId ?? msgLower).replace('lang_', '') as Language
  } else if (msgLower.includes('english') || msgLower === 'en') langSelect = 'en'
  else if (msgLower.includes('hindi') || msgLower === 'hi') langSelect = 'hi'
  else if (msgLower.includes('gujarati') || msgLower === 'gu') langSelect = 'gu'

  let termsAccept = false
  if (buttonId === 'terms_accept' || msgLower === 'terms_accept' || msgLower.includes('accept') || msgLower.includes('yes') || msgLower.includes('haan')) {
    termsAccept = true
  }

  // STEP 2: Language selected
  if (langSelect) {
    const validLangs: Language[] = ['en', 'hi', 'gu']
    const lang = validLangs.includes(langSelect) ? langSelect : 'en'

    // Save language
    await supabase.from('users').update({ language: lang }).eq('id', user.id)

    // Send T&C
    await sendWhatsAppMessage({
      to: phone,
      message: termsMessage(lang) + "\n\nReply with 'Yes' or 'Accept' to continue.",
      buttons: termsButtons(lang)
    })
    return
  }

  // STEP 3: T&C accepted
  if (termsAccept) {
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
  if (buttonId === 'terms_view' || msgLower.includes('view') || msgLower.includes('policy')) {
    await sendWhatsAppMessage({
      to: phone,
      message: `📄 Privacy Policy: https://yourapp.com/privacy\n📄 Terms of Use: https://yourapp.com/terms`
    })
    return
  }

  // If no match found and user hasn't selected language yet, or just sent a random message -> show language picker
  await sendWhatsAppMessage({
    to: phone,
    message: welcomeMessage() + "\n\nPlease reply with 'English', 'Hindi', or 'Gujarati'.",
    buttons: welcomeButtons()
  })
}
