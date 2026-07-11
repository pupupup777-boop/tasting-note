import { requireAuth } from './_lib/auth.js';

// api/extract-name.js
// 캐싱용 가벼운 호출: 사진에서 "제품 이름"만 빠르게 추출한다.
// 출력이 짧아 비용이 적고, 이 이름으로 공용 카탈로그에 이미 있는 와인인지 확인한다.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🔒 로그인(구글 계정) 검증 — 토큰 없거나 무효면 여기서 401/403 응답 후 종료
  const authedUser = await requireAuth(req, res);
  if (!authedUser) return;

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server API key not configured' });
  }

  const { base64Data } = req.body || {};
  if (!base64Data) {
    return res.status(400).json({ error: 'base64Data is required' });
  }

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: "이 주류 라벨 사진에서 제품의 정식 명칭만 추출하세요. 가능하면 영문 정식 명칭으로 통일하고, 빈티지(연도)는 제외한 제품명만 반환하세요. 다른 설명 없이 이름만." },
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '제품 정식 명칭 (영문 우선, 빈티지 제외)' }
        },
        required: ['name']
      }
    }
  };

  const maxRetries = 4;
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

      const parsed = JSON.parse(rawText);
      return res.status(200).json({ name: parsed.name || '' });
    } catch (err) {
      if (i === maxRetries - 1) {
        // 이름 추출이 실패해도 앱은 상세분석으로 자연스럽게 넘어감
        return res.status(500).json({ error: 'Extract failed', detail: String(err) });
      }
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 3000);
    }
  }
}