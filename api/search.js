import { requireAuth } from './_lib/auth.js';

// api/search.js
// 보틀 백과 & 시세 검색용 서버 함수 (Gemini 키를 서버에만 보관)
// 브라우저는 이 함수를 부르고, 이 함수가 키를 들고 구글을 대신 호출한다.

export default async function handler(req, res) {
  // POST만 허용
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

  const { query } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  const payload = {
    contents: [{
      role: 'user',
      parts: [{
        text: `주류 정보 검색 요청: "${query}"

최신 웹 검색 정보(특히 와인싸게사는곳 카페 시세 및 데일리샷 최신 정보)를 바탕으로 아래의 JSON 형식 규칙을 엄격하게 지켜 답변해 주세요. 다른 일반 설명 텍스트는 절대 포함하지 말고 오직 원본 JSON 데이터만 출력해야 합니다:

{
  "name": "검색된 와인/주류의 정확한 한글 및 영문 명칭",
  "summary": "역사와 핵심 특징을 요약한 1~2줄 문장",
  "tasting": "주요 아로마 및 풍미 피니시 특징",
  "avgPrice": "실제 접근 가능한 평균 구매가 범위 (찾을 수 없으면 '정보없음')",
  "bargainInfo": "성지 매장 특가 혹은 플랫폼 최저가 범위 정보 (없으면 '정보없음')"
}`
      }]
    }],
    tools: [{ google_search: {} }]
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

      // ⚠️ 파싱 실패가 catch로 떨어지면 비싼 검색 호출을 통째로 재시도하던 낭비 수정:
      //    여기서 직접 파싱하고, 실패하면 본문 속 JSON 블록을 건져낸 뒤, 그래도 안 되면 재호출 없이 502.
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsed = null;
      try { parsed = JSON.parse(cleaned); }
      catch {
        const m = cleaned.match(/\{[\s\S]*\}/); // 설명 문장 사이에 낀 JSON 덩어리 구출
        if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
      }
      if (!parsed) {
        return res.status(502).json({ error: 'Bad AI response format' });
      }
      return res.status(200).json(parsed);

    } catch (err) {
      if (i === maxRetries - 1) {
        return res.status(500).json({ error: 'Search failed', detail: String(err) });
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}