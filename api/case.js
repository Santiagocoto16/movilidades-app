export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) return res.status(200).json({ error: { message: data.error?.message || 'Sin respuesta' } })
    return res.status(200).json({ content: [{ text }] })
  } catch (error) {
    return res.status(500).json({ error: { message: 'Error al generar el análisis' } })
  }
}
