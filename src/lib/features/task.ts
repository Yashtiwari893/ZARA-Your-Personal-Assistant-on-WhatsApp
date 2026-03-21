import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import {
  taskAdded, taskList, taskCompleted, errorMessage,
  type Language
} from '@/lib/whatsapp/templates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── ADD TASK ─────────────────────────────────────────────────
export async function handleAddTask(params: {
  userId: string
  phone: string
  language: Language
  taskContent: string
  listName: string
  workspaceId?: string
}) {
  const { userId, phone, language, taskContent, listName, workspaceId } = params

  const { data: listId, error: listErr } = await supabase.rpc('get_or_create_list', {
    p_user_id:      userId,
    p_name:         listName,
    p_workspace_id: workspaceId ?? null
  })

  if (listErr) {
    console.error('get_or_create_list error:', listErr)
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  const { error } = await supabase.from('tasks').insert({
    list_id:  listId,
    user_id:  userId,
    content:  taskContent,
  })

  if (error) {
    console.error('task insert error:', error)
    await sendWhatsAppMessage({ to: phone, message: errorMessage(language) })
    return
  }

  await sendWhatsAppMessage({
    to: phone,
    message: taskAdded(taskContent, listName, language)
  })
}

// ─── LIST TASKS ───────────────────────────────────────────────
export async function handleListTasks(params: {
  userId: string
  phone: string
  language: Language
  listName: string
}) {
  const { userId, phone, language, listName } = params

  const { data: list } = await supabase
    .from('lists')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', `%${listName}%`)
    .single()

  if (!list) {
    await sendWhatsAppMessage({
      to: phone,
      message: language === 'hi'
        ? `📭 "${listName}" naam ki koi list nahi mili.`
        : `📭 No list found named "${listName}".`
    })
    return
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('content, completed')
    .eq('list_id', list.id)
    .order('created_at', { ascending: true })

  await sendWhatsAppMessage({
    to: phone,
    message: taskList(list.name, tasks ?? [], language)
  })
}

// ─── COMPLETE TASK ────────────────────────────────────────────
export async function handleCompleteTask(params: {
  userId: string
  phone: string
  language: Language
  taskContent: string    
  listName?: string
}) {
  const { userId, phone, language, taskContent, listName } = params

  let query = supabase
    .from('tasks')
    .select('id, content, list_id')
    .eq('user_id', userId)
    .eq('completed', false)
    .ilike('content', `%${taskContent}%`)

  if (listName) {
    const { data: list } = await supabase
      .from('lists')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', `%${listName}%`)
      .single()
    if (list) query = query.eq('list_id', list.id)
  }

  const { data: tasks } = await query.limit(1)

  if (!tasks || tasks.length === 0) {
    await sendWhatsAppMessage({
      to: phone,
      message: language === 'hi'
        ? `❓ "${taskContent}" naam ka koi task nahi mila.`
        : `❓ No pending task found matching "${taskContent}".`
    })
    return
  }

  await supabase
    .from('tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('id', tasks[0].id)

  await sendWhatsAppMessage({
    to: phone,
    message: taskCompleted(tasks[0].content, language)
  })
}

// ─── LIST ALL LISTS ───────────────────────────────────────────
export async function handleListAllLists(params: {
  userId: string
  phone: string
  language: Language
}) {
  const { userId, phone, language } = params

  const { data: lists } = await supabase
    .from('lists')
    .select(`id, name, tasks(count)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (!lists || lists.length === 0) {
    await sendWhatsAppMessage({
      to: phone,
      message: language === 'hi'
        ? '📭 Abhi koi list nahi hai. "Grocery mein milk add karo" bol ke shuru karo!'
        : '📭 No lists yet. Say "Add milk to grocery" to create one!'
    })
    return
  }

  const listText = lists
    .map(l => `• *${l.name}*`)
    .join('\n')

  await sendWhatsAppMessage({
    to: phone,
    message: (language === 'hi' ? `📋 *Aapki Lists:*\n\n` : `📋 *Your Lists:*\n\n`) + 
             `${listText}\n\n` + 
             (language === 'hi' ? `_Kisi ek list ko dekhne ke liye naam bolo._` : `_Say a list name to view its tasks._`)
  })
}
