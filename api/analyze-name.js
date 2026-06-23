// api/analyze-name.js
// 사진 대신 "이름"으로 주류 정보를 채운다. analyze.js의 텍스트 버전.
// 같은 구조(name/type/region/vintage/grape/producer/detectedCategory)를 반환한다.

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
    `detectedCategory는 wine/whiskey/sake/beer 중 가장 적합한 것으로 판단하세요. ` +
    `type에는 세부 종류(예: 레드 와인, 싱글몰트 위스키 등)를 적으세요.`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '제품 정식 명칭(영문 우선)' },
          type: { type: 'STRING', description: '세부 종류' },
          region: { type: 'STRING', description: '지역/국가' },
          vintage: { type: 'STRING', description: '빈티지/연도 (모르면 빈 문자열)' },
          grape: { type: 'STRING', description: '품종/원재료 (모르면 빈 문자열)' },
          producer: { type: 'STRING', description: '생산자/브랜드' },
          detectedCategory: { type: 'STRING', enum: ['wine', 'whiskey', 'sake', 'beer'], description: '주종' }
        },
        required: ['name', 'type', 'detectedCategory']
      }
    }
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Gemini error: ${response.status}`, detail: errorText });
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: 'Empty response from Gemini' });
    }

    const parsed = JSON.parse(rawText);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Analyze-name failed', detail: String(err) });
  }
}