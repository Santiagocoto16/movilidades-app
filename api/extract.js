export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { pdf } = req.body

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf }
            },
            {
              type: 'text',
              text: 'Extraé y resumí toda la información relevante de este documento. Solo el resumen, sin comentarios adicionales.'
            }
          ]
        }],
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    return res.status(200).json({ text })
  } catch (error) {
    return res.status(500).json({ error: 'Error al procesar el PDF' })
  }
}
