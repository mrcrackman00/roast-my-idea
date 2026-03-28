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

  const seed = Math.floor(Math.random() * 1000000); // Random seed to force AI variety

  const sysPrompt = `You are ${tone} You have seen 10,000 startup ideas. Analyze the idea, name real competitors, point out exact market problems. Then give scores out of 10 for: Originality, Market Size, Execution Difficulty, Competition Level. Finally give exactly 3 very specific actionable improvements. 

### CONSTRAINTS:
1. You MUST respond ONLY in valid JSON format.
2. NO markdown, NO backticks, NO prefix/suffix text.
3. Use ONLY double quotes for keys and values.
4. DO NOT use unescaped double quotes inside strings (e.g., use \\" instead).
5. NO trailing commas.
6. RANDOM SEED [${seed}]: Ensure unique scores and feedback for this specific idea.

EXAMPLE RESPONSE:
{"roast": "Brutal critique here...", "scores": {"originality": 7, "marketSize": 5, "executionDifficulty": 8, "competitionLevel": 9}, "improvements": ["Fix X", "Do Y", "Scale Z"]}

JSON OUTPUT ONLY:`;

  try {
    console.log('--- Roast Request ---');
    console.log('Idea:', idea.substring(0, 100) + '...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: `Idea: ${idea}` }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" } // Force JSON mode if supported
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
        const errText = await response.text();
        console.error('Groq API Error Status:', response.status, errText);
        let message = 'Groq API error';
        try {
            const errData = JSON.parse(errText);
            message = errData.error?.message || message;
        } catch(e) {}
        throw new Error(message);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Robust extraction
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('AI failed to output JSON. Please try again.');
    }
    
    let jsonStr = content.substring(firstBrace, lastBrace + 1);

    // Advanced Sanitization
    const sanitize = (str) => {
        return str
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
            .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
            .trim();
    };

    jsonStr = sanitize(jsonStr);
    
    try {
        const parsed = JSON.parse(jsonStr);
        return res.status(200).json(parsed);
    } catch (e) {
        console.error('Final Parse Attempt. Raw:', jsonStr);
        
        // Final "Heal" attempt: 
        // 1. Escape internal quotes while preserving delimiters
        // 2. This regex looks for quotes NOT preceded by [ { , : (with optional space)
        // AND NOT followed by : , ] } (with optional space)
        let healed = jsonStr.replace(/(?<![\{\[:,\s])\s*"\s*(?![\}:,\s])/g, '\\"');
        
        try {
            const fixed = JSON.parse(healed);
            return res.status(200).json(fixed);
        } catch (e2) {
            // Last resort: If the AI failed JSON but gave text, wrap it manually
            // This is risky but better than a crash if the roast is readable
            if (jsonStr.includes('"roast":')) {
                console.warn('Manual JSON reconstruction triggered');
            }
            throw new Error('AI output malformed. Please try a simpler description of your idea.');
        }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
        console.error('Request Timed Out (9s)');
        return res.status(504).json({ error: 'AI took too long to respond. Try again!' });
    }
    console.error('Final API Error Wrapper:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to generate roast' });
  }
}
