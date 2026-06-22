// api/analyze.js
// 라벨 이미지 분석용 서버 함수 (Gemini 키를 서버에만 보관)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server API key not configured' });
  }

  // base64Data: data URL 접두사("data:image/...;base64,")가 제거된 순수 base64 문자열
  // liquorName: 현재 선택된 주종 이름 (예: "와인")
  const { base64Data, liquorName } = req.body || {};
  if (!base64Data) {
    return res.status(400).json({ error: 'base64Data is required' });
  }

  const prompt = `주류 라벨 이미지 분석 요청.
현재 선택한 주종 카테고리는 '${liquorName || '와인'}'입니다.

[커뮤니티 등록 가이드] 본 사진은 사용자가 직접 마시고 업로드하는 와인 라벨입니다. 텍스트 OCR 매칭 조건 없이 라벨 해독에만 집중하세요.
[주종 자동 동기화 보정]
실제 분석된 종류가 다를 경우 'detectedCategory' 항목에 알맞은 올바른 주종 키값('wine', 'whiskey', 'sake', 'beer' 중 하나)을 지정해주세요.`;

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '주류의 정식 공식 명칭' },
          type: { type: 'STRING', description: '상세 종류/스타일분류' },
          region: { type: 'STRING', description: '생산지 국가 및 세부지역' },
          vintage: { type: 'STRING', description: '빈티지 년도 또는 숙성연수 정보 (없을 경우 null)' },
          grape: { type: 'STRING', description: '포도 품종, 사용 맥아, 주조미 쌀 품종, 캐스크 정보 등' },
          producer: { type: 'STRING', description: '양조장/증류소/제조업체 명칭' },
          detectedCategory: { type: 'STRING', description: "자동 판정 카테고리 ('wine', 'whiskey', 'sake', 'beer' 중 반드시 택일)" },
          isCodeDetected: { type: 'BOOLEAN', description: '무조건 true로 반환하세요.' }
        },
        required: ['name', 'type', 'region', 'vintage', 'grape', 'producer', 'detectedCategory', 'isCodeDetected']
      }
    }
  };

  const maxRetries = 3;
  let delay = 1500;

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

      if (response.status === 503 && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
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

      const parsed = JSON.parse(rawText);
      return res.status(200).json(parsed);

    } catch (err) {
      if (i === maxRetries - 1) {
        return res.status(500).json({ error: 'Analyze failed', detail: String(err) });
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}