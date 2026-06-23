// api/analyze-name.js
// 사진 대신 "이름"으로 주류 정보를 채운다.
// 구글 검색 그라운딩은 503이 잦고 느려서 사용하지 않고, 구조화 출력(responseSchema)으로 빠르고 안정적으로 처리한다.
// 유명한 제품은 AI 지식만으로 충분히 채워지며, 503 발생 시 재시도한다.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server API key not configured' });
  }

  const { name, liquorName } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name(제품 이름)이 필요합니다' });
  }

  const cat = liquorName || '주류';
  const prompt =
    `다음은 사용자가 입력한 '${cat}' 제품의 이름입니다: "${name}". ` +
    `이 제품에 대해 아는 정보를 채워주세요. 정확히 모르는 항목은 추측하지 말고 빈 문자열로 두세요. ` +
    `name은 정식 명칭(영문 우선)으로 보정하고, detectedCategory는 wine/whiskey/sake/beer 중 가장 적합한 것으로 판단하세요. ` +
    `type에는 세부 종류(예: 레드 와인, 싱글몰트 위스키)를 적으세요.`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          type: { type: 'STRING' },
          region: { type: 'STRING' },
          vintage: { type: 'STRING' },
          grape: { type: 'STRING' },
          producer: { type: 'STRING' },
          detectedCategory: { type: 'STRING', enum: ['wine', 'whiskey', 'sake', 'beer'] }
        },
        required: ['name', 'type', 'detectedCategory']
      }
    }
  };

  const maxRetries = 6;
  let delay = 800;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      // 503(일시 과부하) 또는 429(한도)면 잠시 후 재시도
      if ((response.status === 503 || response.status === 429) && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 3000);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `Gemini error: ${response.status}`, detail: errorText });
      }

      const result = await response.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return res.status(502).json({ error: 'Empty response from Gemini' });
      }

      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);

    } catch (err) {
      if (i === maxRetries - 1) {
        return res.status(500).json({ error: 'Analyze-name failed', detail: String(err) });
      }
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 3000);
    }
  }
}