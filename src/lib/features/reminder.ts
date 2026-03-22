import { createClient } from '@supabase/supabase-js'
import { parseDateTime }  from '@/lib/ai/dateParser'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import {
  reminderSet, reminderList, reminderSnoozed, errorMessage,
  type Language
} from '@/lib/whatsapp/templates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── SET REMINDER ─────────────────────────────────────────────
export async function handleSetReminder(params: {
  userId: string
  phone: string
  language: Language
  message: string
  dateTimeText?: string
  reminderTitle?: string
}) {
  const { userId, phone, language, message, dateTimeText, reminderTitle } = params

  // Parse natural language date/time
  const textToParse = dateTimeText ?? message
  const parsed = await parseDateTime(textToParse)

  if (!parsed.date && !parsed.isRecurring) {
    // Could not understand time — ask user
    await sendWhatsAppMessage({
      to: phone,
      message: language === 'hi'
        ? '❓ Kab remind karna hai? Jaise "kal 5 bje" ya "Sunday 9pm"'
        : '❓ When should I remind you? E.g. "tomorrow 5pm" or "every Sunday 9am"'
    })
    return
  }

  // Title — use extracted or clean up the full message
  const title = reminderTitle
    ?? message.replace(/(remind|reminder|yaad|dilana|set|karo|please)/gi, '').trim()

  // Save to Supabase
  const { error } = await supabase
    .from('reminders')
    .insert({
      user_id:          userId,
      title,
      scheduled_at:     parsed.date?.toISOString(),
      recurrence:       parsed.recurrence,
      status:           'pending'
    })

  if (error) {
    console.error('[reminder] Insert failed:', error)
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  // Confirm to user
  await sendWhatsAppMessage({
    to: phone,
    message: reminderSet(title, parsed.humanReadable, language)
  })
}

// ─── LIST REMINDERS ───────────────────────────────────────────
export async function handleListReminders(params: {
  userId: string
  phone: string
  language: Language
}) {
  const { userId, phone, language } = params

  const { data, error } = await supabase
    .from('reminders')
    .select('title, scheduled_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })
    .limit(10)

  if (error) {
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  const reminders = (data ?? []).map(r => ({
    title: r.title,
    scheduledAt: new Date(r.scheduled_at)
  }))

  await sendWhatsAppMessage({
    to: phone,
    message: reminderList(reminders, language)
  })
}

// ─── SNOOZE REMINDER ──────────────────────────────────────────
export async function handleSnoozeReminder(params: {
  reminderId?: string
  userId?: string
  phone: string
  language: Language
  minutes?: number          
  customText?: string       
}) {
  const { reminderId, userId, phone, language, minutes, customText } = params

  let targetReminderId = reminderId

  // If no reminderId is provided (conversational flow), find the most recently sent/pending reminder
  if (!targetReminderId && userId) {
    const { data: recent } = await supabase
      .from('reminders')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['sent', 'pending'])
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .single()

    if (recent) targetReminderId = recent.id
  }

  if (!targetReminderId) {
    await sendWhatsAppMessage({
      to: phone,
      message: language === 'hi' ? '🤔 Mujhe koi recent reminder nahi mila jise snooze kar saku.' : '🤔 I could not find a recent reminder to snooze.'
    })
    return
  }

  let newTime: Date

  if (minutes) {
    newTime = new Date(Date.now() + minutes * 60 * 1000)
  } else if (customText) {
    const parsed = await parseDateTime(customText)
    if (!parsed.date) {
      await sendWhatsAppMessage({
        to: phone,
        message: language === 'hi'
          ? '❓ Kitne time baad remind karna hai?'
          : '❓ When should I snooze until?'
      })
      return
    }
    newTime = parsed.date
  } else {
    // Default snooze is 15 minutes in conversational flow
    newTime = new Date(Date.now() + 15 * 60 * 1000)
  }

  await supabase.rpc('snooze_reminder', {
    p_reminder_id: targetReminderId,
    p_new_time:    newTime.toISOString()
  })

  // Since we snoozed it, we should ensure the status is changed back to pending
  await supabase.from('reminders').update({ status: 'pending' }).eq('id', targetReminderId)

  const humanReadable = newTime.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    timeStyle: 'short',
    dateStyle: 'short'
  })

  await sendWhatsAppMessage({
    to: phone,
    message: reminderSnoozed(humanReadable, language)
  })
}

// ─── CANCEL REMINDER ──────────────────────────────────────────
export async function handleCancelReminder(params: {
  reminderId: string
  phone: string
  language: Language
}) {
  const { reminderId, phone, language } = params

  await supabase
    .from('reminders')
    .update({ status: 'cancelled' })
    .eq('id', reminderId)

  await sendWhatsAppMessage({
    to: phone,
    message: language === 'hi'
      ? '🗑️ Reminder cancel ho gaya!'
      : '🗑️ Reminder cancelled!'
  })
}

// ─── MARK DONE (from button tap) ─────────────────────────────
export async function handleReminderDone(params: {
  reminderId: string
  phone: string
  language: Language
}) {
  const { reminderId, phone, language } = params

  await supabase
    .from('reminders')
    .update({ status: 'sent' })
    .eq('id', reminderId)

  await sendWhatsAppMessage({
    to: phone,
    message: language === 'hi' ? '✅ Mark ho gaya!' : '✅ Done!'
  })
}
