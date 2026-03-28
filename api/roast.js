export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { idea, harshness } = req.body;

  if (!idea) {
    return res.status(400).json({ error: 'Idea is required' });
  }

  const API_KEY = process.env.GROQ_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Groq API Key not configured on server' });
  }

  let tone = "the most brutal, honest startup critic in Silicon Valley. Roast the user's idea mercilessly and destroy their ego — be very specific about WHY it will fail.";
  if (harshness === 'soft') {
    tone = "a gentle, supportive startup coach. Point out flaws but focus heavily on encouragement and soft corrections.";
  } else if (harshness === 'real') {
    tone = "a sharp, realistic Y Combinator partner. Be direct, pragmatic, and brutally objective about market realities, no fluff.";
  }

  const sysPrompt = `You are ${tone} You have seen 10,000 startup ideas. Analyze the idea, name real competitors, point out exact market problems. Then give scores out of 10 for: Originality, Market Size, Execution Difficulty, Competition Level. Finally give exactly 3 very specific actionable improvements. You MUST respond ONLY in valid JSON format with NO markdown, NO backticks, just pure JSON: {"roast": "string", "scores": {"originality": 0, "marketSize": 0, "executionDifficulty": 0, "competitionLevel": 0}, "improvements": ["string", "string", "string"]}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: `Idea: ${idea}` }
        ],
        temperature: 0.8
      })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Groq API error');
    }

    const data = await response.json();
    let jsonStr = data.choices[0].message.content.trim();
    // Clean up markdown markers if present
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    return res.status(200).json(JSON.parse(jsonStr));
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate roast' });
  }
}
