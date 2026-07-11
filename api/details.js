import { requireAuth } from './_lib/auth.js';

// api/details.js
// 라벨 분석 후 "자세한 정보"용 — 역사/특징/테이스팅 (금액·시세 제외, 그래서 캐싱 가능)
// google_search로 정확도를 높이고 503은 재시도.

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

  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const payload = {
    contents: [{
      role: 'user',
      parts: [{
        text: `주류 "${name}"에 대한 자세한 정보를 웹 검색으로 찾아 아래 JSON 형식만 정확히 출력하세요. 다른 설명 텍스트나 코드블록 없이 오직 JSON만 출력하세요. 가격·시세 정보는 넣지 마세요:

{
  "summary": "역사·배경·핵심 특징을 3~4문장으로 설명",
  "tasting": "대표적인 아로마, 풍미, 피니시 특징을 2~3문장으로",
  "pairing": "어울리는 음식이나 마시는 팁 1~2문장 (모르면 빈 문자열)",
  "trivia": "흥미로운 사실이나 알아두면 좋은 점 1~2문장 (없으면 빈 문자열)"
}`
      }]
    }],
    tools: [{ google_search: {} }]
  };

  const maxRetries = 4;
  let delay = 1000;

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

      // ⚠️ 파싱 실패 시 비싼 grounded 호출을 재시도하던 낭비 수정 (search.js와 동일 처리)
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsed = null;
      try { parsed = JSON.parse(cleaned); }
      catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
      }
      if (!parsed) {
        return res.status(502).json({ error: 'Bad AI response format' });
      }
      return res.status(200).json(parsed);

    } catch (err) {
      if (i === maxRetries - 1) {
        return res.status(500).json({ error: 'Details failed', detail: String(err) });
      }
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 3000);
    }
  }
}