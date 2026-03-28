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
3. Use ONLY double quotes for keys and strings.
4. DO NOT use unescaped double quotes inside strings (use \" instead).
5. DO NOT include trailing commas.
6. RANDOM SEED [${seed}]: Do NOT repeat scores from previous runs (e.g., avoid always giving 4, 7, 6, 8). Be dynamic and specific to THIS idea.

JSON STRUCTURE: 
{"roast": "string", "scores": {"originality": 0, "marketSize": 0, "executionDifficulty": 0, "competitionLevel": 0}, "improvements": ["string", "string", "string"]}`;

  try {
    console.log('--- Roast Request ---');
    console.log('Idea:', idea.substring(0, 100) + '...');
    
    // Add an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9 sec timeout for Groq

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
        temperature: 0.8
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
    
    // Robust extraction: find the first { and last }
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
        console.error('AI non-JSON output:', content);
        throw new Error('AI failed to output valid JSON format.');
    }
    
    let jsonStr = content.substring(firstBrace, lastBrace + 1);

    // Sanitization layer
    jsonStr = jsonStr
        .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
        .trim();
    
    try {
        const parsed = JSON.parse(jsonStr);
        return res.status(200).json(parsed);
    } catch (e) {
        console.error('Initial Parse Fail. Raw:', jsonStr);
        // Fallback: If it's a quote issue, try a simple fix
        try {
            const secondaryFix = jsonStr.replace(/(?<![:[,])"(?![:,\]}])/g, '\\"');
            const fixed = JSON.parse(secondaryFix);
            return res.status(200).json(fixed);
        } catch (e2) {
            console.error('Secondary Parse Fail. Fixed logic:', secondaryFix);
            throw new Error('AI output was malformed. Please try again.');
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
