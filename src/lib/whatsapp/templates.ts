export type Language = 'en' | 'hi' | 'gu'

// ─── ONBOARDING ───────────────────────────────────────────────
export function welcomeMessage(): string {
  return `Hey! 👋 I'm *SAM* — your personal assistant on WhatsApp.

You can send me messages or voice notes in *any language* and I'll understand!

Which language should I reply in?`
}

export function welcomeButtons() {
  return [
    { id: 'lang_en', title: '🇬🇧 English' },
    { id: 'lang_hi', title: '🇮🇳 हिन्दी' },
    { id: 'lang_gu', title: '🇮🇳 ગુજરાતી' },
  ]
}

export function termsMessage(lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `*Terms & Privacy*\n\nBy using SAM, you agree to our Terms of Use and Privacy Policy.\n\nYour data is safe with us. 🔒`,
    hi: `*नियम और गोपनीयता*\n\nSAM का उपयोग करके, आप हमारी शर्तों से सहमत हैं।\n\nआपका डेटा सुरक्षित है। 🔒`,
    gu: `*નિયમો અને ગોપનીયતા*\n\nSAM નો ઉપયોગ કરીને, આપ અમારી શરતો સ્વીકારો છો।\n\nઆપનો ડેટા સુરક્ષિત છે. 🔒`,
  }
  return msgs[lang]
}

export function termsButtons(lang: Language) {
  const labels: Record<Language, [string, string]> = {
    en: ['✅ Accept & Continue', '📄 View Policies'],
    hi: ['✅ स्वीकार करें', '📄 नीतियां देखें'],
    gu: ['✅ સ્વીકાર કરો', '📄 નીતિ જુઓ'],
  }
  return [
    { id: 'terms_accept', title: labels[lang][0] },
    { id: 'terms_view',   title: labels[lang][1] },
  ]
}

export function onboardingComplete(name: string, lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `Great, ${name}! 🎉 I'm ready to help you.\n\nTry saying:\n💊 _"Remind me to take medicine every day at 8am"_\n🛒 _"Add milk to grocery list"_\n📄 _"Save my aadhar card"_\n\nOr just ask me anything!`,
    hi: `बढ़िया, ${name}! 🎉 मैं मदद के लिए तैयार हूं।\n\nबोलकर देखें:\n💊 _"रोज सुबह 8 बजे दवाई की याद दिलाना"_\n🛒 _"ग्रोसरी में दूध add करो"_`,
    gu: `સરસ, ${name}! 🎉 હું મદદ કરવા તૈયાર છું।\n\nઅજ઼માઈ જુઓ:\n💊 _"રોજ સવારે 8 વાગ્યે દવા ની યાદ અપાવો"_`,
  }
  return msgs[lang]
}

// ─── REMINDERS ────────────────────────────────────────────────
export function reminderSet(
  title: string,
  humanReadable: string,
  lang: Language
): string {
  const msgs: Record<Language, string> = {
    en: `⏰ *Reminder set!*\n\n📝 ${title}\n🕐 ${humanReadable}\n\n_I'll notify you then!_`,
    hi: `⏰ *रिमाइंडर सेट!*\n\n📝 ${title}\n🕐 ${humanReadable}\n\n_मैं उस समय याद दिलाऊंगा!_`,
    gu: `⏰ *રિમાઇન્ડર સેટ!*\n\n📝 ${title}\n🕐 ${humanReadable}\n\n_હું ત્યારે યાદ અપાવીશ!_`,
  }
  return msgs[lang]
}

export function reminderAlert(
  title: string,
  note: string | null,
  lang: Language
): string {
  const noteText = note ? `\n📌 ${note}` : ''
  const msgs: Record<Language, string> = {
    en: `⏰ *Reminder*\n\n📝 ${title}${noteText}`,
    hi: `⏰ *रिमाइंडर*\n\n📝 ${title}${noteText}`,
    gu: `⏰ *રિમાઇન્ડર*\n\n📝 ${title}${noteText}`,
  }
  return msgs[lang]
}

export function reminderAlertButtons(reminderId: string) {
  return [
    { id: `snooze_10_${reminderId}`,  title: '⏱ Snooze 10 min' },
    { id: `snooze_30_${reminderId}`,  title: '⏱ Snooze 30 min' },
    { id: `done_${reminderId}`,       title: '✅ Done' },
  ]
}

export function reminderSnoozed(humanReadable: string, lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `⏰ *Reminder snoozed!*\n\n_I'll remind you at ${humanReadable}_`,
    hi: `⏰ *रिमाइंडर स्नूज़!*\n\n_${humanReadable} पर याद दिलाऊंगा_`,
    gu: `⏰ *રિમાઇન્ડર સ્નૂઝ!*\n\n_${humanReadable} ઉ઼ YAD APAVIsh_`,
  }
  return msgs[lang]
}

export function reminderList(
  reminders: Array<{ title: string; scheduledAt: Date }>,
  lang: Language
): string {
  if (reminders.length === 0) {
    const empty: Record<Language, string> = {
      en: '📭 You have no pending reminders.',
      hi: '📭 कोई पेंडिंग रिमाइंडर नहीं है।',
      gu: '📭 કોઈ પેન્ડિંગ રિમાઇન્ડર નથી.',
    }
    return empty[lang]
  }

  const header: Record<Language, string> = {
    en: '⏰ *Your Reminders:*',
    hi: '⏰ *आपके रिमाइंडर:*',
    gu: '⏰ *આપના રિમાઇન્ડર:*',
  }

  const items = reminders.map((r, i) => {
    const time = r.scheduledAt.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    })
    return `${i + 1}. ${r.title} — _${time}_`
  }).join('\n')

  return `${header[lang]}\n\n${items}`
}

// ─── TASKS ────────────────────────────────────────────────────
export function taskAdded(content: string, listName: string, lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `✅ Added *${content}* to your *${listName}* list!`,
    hi: `✅ *${content}* को *${listName}* list में add किया!`,
    gu: `✅ *${content}* ને *${listName}* list માં ઉ઼mero!`,
  }
  return msgs[lang]
}

export function taskList(
  listName: string,
  tasks: Array<{ content: string; completed: boolean }>,
  lang: Language
): string {
  const pending = tasks.filter(t => !t.completed)
  const done    = tasks.filter(t => t.completed)

  const header: Record<Language, string> = {
    en: `📋 *${listName} List*`,
    hi: `📋 *${listName} List*`,
    gu: `📋 *${listName} List*`,
  }

  const pendingItems = pending.length > 0
    ? pending.map(t => `☐ ${t.content}`).join('\n')
    : (lang === 'en' ? '_Nothing pending_' : '_कुछ पेंडिंग नहीं_')

  const doneItems = done.length > 0
    ? '\n\n✅ ' + done.map(t => `~${t.content}~`).join('\n✅ ')
    : ''

  return `${header[lang]}\n\n${pendingItems}${doneItems}`
}

export function taskCompleted(content: string, lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `✅ *${content}* marked as done!`,
    hi: `✅ *${content}* complete हो गया!`,
    gu: `✅ *${content}* પૂURA THAYOO!`,
  }
  return msgs[lang]
}

// ─── DOCUMENTS ────────────────────────────────────────────────
export function documentSaved(label: string, lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `📁 *Document saved!*\n\nLabel: *${label}*\n\n_Say "find my ${label}" anytime to get it back._`,
    hi: `📁 *Document save हो गया!*\n\nLabel: *${label}*\n\n_"${label} dikhao" bolke wapas paa sakte ho._`,
    gu: `📁 *Document save THAYOO!*\n\nLabel: *${label}*`,
  }
  return msgs[lang]
}

export function documentNotFound(query: string, lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `🔍 No document found for "*${query}*".\n\nTry sending me a photo or PDF to save it!`,
    hi: `🔍 "*${query}*" से कोई document नहीं मिला।\n\nKoi photo ya PDF bhejo save karne ke liye!`,
    gu: `🔍 "*${query}*" MATE KOI document NATHI MALYO.`,
  }
  return msgs[lang]
}

// ─── MORNING BRIEFING ─────────────────────────────────────────
export function morningBriefing(
  name: string,
  pendingTasks: number,
  todayReminders: number,
  lang: Language
): string {
  const greeitngs: Record<Language, string> = {
    en: `🌅 *Good Morning, ${name}!*\n\nHere's your day:\n\n📋 Tasks: *${pendingTasks} pending*\n⏰ Reminders: *${todayReminders} today*\n\n_Have a great day!_ ☀️`,
    hi: `🌅 *सुप्रभात, ${name}!*\n\nआज का summary:\n\n📋 Tasks: *${pendingTasks} pending*\n⏰ Reminders: *${todayReminders} aaj*\n\n_शुभ दिन हो!_ ☀️`,
    gu: `🌅 *સુPRABHAT, ${name}!*\n\nAaj noo summary:\n\n📋 Tasks: *${pendingTasks} pending*\n⏰ Reminders: *${todayReminders} aaj*\n\n_SHUBH DIN!_ ☀️`,
  }
  return greeitngs[lang]
}

// ─── HELP / MENU ──────────────────────────────────────────────
export function helpMessage(lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `🤖 *What I can do:*

⏰ *Reminders*
"Remind me to call mom at 6pm"
"Remind me every Sunday at 9am"

📋 *Lists & Tasks*
"Add milk to grocery list"
"Show my grocery list"
"Milk done"

📁 *Document Vault*
Send any photo/PDF → I'll save it
"Show my aadhar"

🌅 *Morning Briefing*
Automatic daily at 9 AM

💬 *AI Chat*
Ask me anything!`,

    hi: `🤖 *मैं क्या कर सकता हूं:*

⏰ *रिमाइंडर*
"शाम 6 बजे मम्मी को call करना याद दिलाना"

📋 *Lists & Tasks*
"Grocery में दूध add करो"
"मेरी grocery list दिखाओ"

📁 *Document Vault*
कोई भी photo/PDF भेजो → save हो जाएगा
"मेरा आधार दिखाओ"

💬 *AI Chat*
कुछ भी पूछो!`,

    gu: `🤖 *Hu shu kari shakoo:*

⏰ *Reminders, Lists, Documents, AI Chat*

Koi pan message karo — Hu SAMJI JAIS!`,
  }
  return msgs[lang]
}

// ─── ERROR ────────────────────────────────────────────────────
export function errorMessage(lang: Language): string {
  const msgs: Record<Language, string> = {
    en: `😕 Something went wrong. Please try again!\n\nSay *"help"* to see what I can do.`,
    hi: `😕 कुछ गड़बड़ हो गई। फिर कोशिश करो!\n\n*"help"* बोलो to dekhoo mai kya kar sakta hoon.`,
    gu: `😕 Koi takleef aayi. Fari try karo!`,
  }
  return msgs[lang]
}
