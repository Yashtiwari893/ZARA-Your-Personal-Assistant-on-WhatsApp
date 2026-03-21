import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { morningBriefing, type Language } from '@/lib/whatsapp/templates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── SEND BRIEFING TO ONE USER ────────────────────────────────
export async function sendBriefingToUser(user: {
  user_id: string
  phone: string
  name: string | null
  language: string
  pending_tasks: number
  todays_reminders: number
}) {
  const lang = (user.language as Language) ?? 'en'
  const name = user.name ?? 'there'

  // Get today's reminders detail
  const { data: reminders } = await supabase
    .from('reminders')
    .select('title, scheduled_at')
    .eq('user_id', user.user_id)
    .eq('status', 'pending')
    .gte('scheduled_at', new Date().toISOString().split('T')[0])
    .lte('scheduled_at', new Date().toISOString().split('T')[0] + 'T23:59:59+05:30')
    .order('scheduled_at')
    .limit(5)

  let message = morningBriefing(name, user.pending_tasks, user.todays_reminders, lang)

  if (reminders && reminders.length > 0) {
    const reminderLines = reminders.map(r => {
      const time = new Date(r.scheduled_at).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        timeStyle: 'short'
      })
      return `  • ${r.title} — ${time}`
    }).join('\n')

    message += (lang === 'hi' ? `\n\n*Aaj ke Reminders:*\n` : `\n\n*Today's Reminders:*\n`) + reminderLines
  }

  await sendWhatsAppMessage({ to: user.phone, message })

  await supabase.from('briefing_logs').insert({
    user_id: user.user_id,
    date: new Date().toISOString().split('T')[0]
  })
}

// ─── SEND BRIEFING TO ALL DUE USERS ──────────────────────────
export async function sendMorningBriefingToAll() {
  const { data: users, error } = await supabase
    .from('users_due_for_briefing')
    .select('*')

  if (error) {
    console.error('[briefing] Failed to fetch users:', error)
    return { sent: 0, failed: 0 }
  }

  if (!users || users.length === 0) return { sent: 0, failed: 0 }

  const results = await Promise.allSettled(
    users.map(user => sendBriefingToUser(user))
  )

  return {
    sent:   results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  }
}

// ─── MANUAL BRIEFING ──────────────────────────────────────────
export async function handleGetBriefing(params: {
  userId: string
  phone: string
  language: Language
}) {
  const { userId, phone, language } = params

  const { count: pendingTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('completed', false)

  const today = new Date().toISOString().split('T')[0]
  const { count: todayReminders } = await supabase
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('scheduled_at', `${today}T00:00:00+05:30`)
    .lte('scheduled_at', `${today}T23:59:59+05:30`)

  const { data: user } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .single()

  await sendWhatsAppMessage({
    to: phone,
    message: morningBriefing(
      user?.name ?? 'there',
      pendingTasks ?? 0,
      todayReminders ?? 0,
      language
    )
  })
}
