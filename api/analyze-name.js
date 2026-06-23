// api/analyze-name.js
// 사진 대신 "이름"으로 주류 정보를 채운다. 구글 검색(google_search)으로 실제 정보를 찾아 정확도를 높인다.
// search.js와 동일한 방식(검색 그라운딩 + 텍스트 JSON 파싱 + 503 재시도).

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

  const payload = {
    contents: [{
      role: 'user',
      parts: [{
        text: `'${cat}' 제품 정보 검색 요청: "${name}"

최신 웹 검색 정보를 바탕으로, 아래 JSON 형식만 정확히 출력하세요. 다른 설명 텍스트는 절대 넣지 말고 오직 JSON만 출력하세요. 확실히 모르는 항목은 빈 문자열("")로 두고 추측하지 마세요:

{
  "name": "제품 정식 명칭 (한글 또는 영문)",
  "type": "세부 종류 (예: 레드 와인, 싱글몰트 위스키, 준마이 사케 등)",
  "region": "생산 지역/국가",
  "vintage": "빈티지/연도 (없거나 모르면 빈 문자열)",
  "grape": "품종 또는 주원료 (모르면 빈 문자열)",
  "producer": "생산자/와이너리/브랜드",
  "detectedCategory": "wine, whiskey, sake, beer 중 가장 적합한 하나"
}`
      }]
    }],
    tools: [{ google_search: {} }]
  };

  const maxRetries = 3;
  let delay = 1200;

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

      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);

    } catch (err) {
      if (i === maxRetries - 1) {
        return res.status(500).json({ error: 'Analyze-name failed', detail: String(err) });
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}