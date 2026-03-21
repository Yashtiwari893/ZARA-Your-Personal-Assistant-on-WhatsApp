import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export interface ParsedDateTime {
  date: Date | null
  isRecurring: boolean
  recurrence: 'daily' | 'weekly' | 'monthly' | null
  recurrenceTime: string | null   // "09:00" for recurring
  confidence: number
  humanReadable: string           // "Tomorrow at 11:00 AM"
}

/**
 * "kal 11 bje", "Sunday 2pm", "agle somwar" → JavaScript Date object
 * Uses Groq for natural language understanding
 */
export async function parseDateTime(
  text: string,
  userTimezone: string = 'Asia/Kolkata'
): Promise<ParsedDateTime> {
  const now = new Date()
  const nowIST = new Intl.DateTimeFormat('en-IN', {
    timeZone: userTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now)

  const prompt = `Current date/time (IST): ${nowIST}
User timezone: ${userTimezone}

Parse this date/time text and return ONLY valid JSON:
"${text}"

Hindi words reference:
- kal = tomorrow
- aaj = today  
- parso = day after tomorrow
- subah = morning (9 AM if no time given)
- dopahar = afternoon (2 PM)
- shaam = evening (6 PM)
- raat = night (9 PM)
- bje / baje = o'clock (e.g. "11 bje" = 11:00)
- somwar = Monday, mangalwar = Tuesday, budhwar = Wednesday
- guruwar = Thursday, shukrawar = Friday, shaniwar = Saturday, raviwar = Sunday
- har din = every day, har hafta = every week, har mahina = every month

Return JSON:
{
  "isoDateTime": "2024-03-22T11:00:00+05:30",
  "isRecurring": false,
  "recurrence": null,
  "recurrenceTime": null,
  "confidence": 0.95,
  "humanReadable": "Tomorrow at 11:00 AM"
}

For recurring: { "isRecurring": true, "recurrence": "weekly", "recurrenceTime": "14:00", "isoDateTime": null }
If cannot parse: { "isoDateTime": null, "confidence": 0 }`

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 150,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    })

    const raw = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw)

    return {
      date: parsed.isoDateTime ? new Date(parsed.isoDateTime) : null,
      isRecurring: parsed.isRecurring ?? false,
      recurrence: parsed.recurrence ?? null,
      recurrenceTime: parsed.recurrenceTime ?? null,
      confidence: parsed.confidence ?? 0,
      humanReadable: parsed.humanReadable ?? text
    }
  } catch (err) {
    console.error('[dateParser] Failed:', err)
    return {
      date: null,
      isRecurring: false,
      recurrence: null,
      recurrenceTime: null,
      confidence: 0,
      humanReadable: text
    }
  }
}
