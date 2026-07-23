import { requireAuth } from './_lib/auth.js';

// api/analyze.js
// 라벨 이미지 분석용 서버 함수 (Gemini 키를 서버에만 보관)

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

  // base64Data: data URL 접두사("data:image/...;base64,")가 제거된 순수 base64 문자열
  // liquorName: 현재 선택된 주종 이름 (예: "와인")
  const { base64Data, liquorName } = req.body || {};
  if (!base64Data) {
    return res.status(400).json({ error: 'base64Data is required' });
  }

  const prompt = `주류 라벨 이미지 분석 요청.
현재 선택한 주종 카테고리는 '${liquorName || '와인'}'입니다.

[커뮤니티 등록 가이드] 본 사진은 사용자가 직접 마시고 업로드하는 라벨입니다. 텍스트 OCR 매칭 조건 없이 라벨 해독에만 집중하세요.

[정확한 판독 지침]
- 라벨의 모든 텍스트(작은 글씨, 상단/하단/측면 포함)를 꼼꼼히 읽으세요.
- 와인(특히 프랑스 부르고뉴/보르도)의 경우 '생산자(Domaine/Château/Maison)'와 '아펠라시옹(원산지 명칭, 예: Gevrey-Chambertin, Pommard)'을 반드시 구분하세요. producer에는 도멘/샤또 이름을, region에는 아펠라시옹과 국가/세부지역을 넣으세요.
- name은 반드시 라벨의 공식 로마자(영문/원어) 표기로 적으세요. 한글 번역·음차 금지. '생산자 + 제품명(퀴베/아펠라시옹)' 형식으로 가장 일반적으로 불리는 형태로 적되, 빈티지(연도)는 name에 절대 넣지 말고 vintage 항목에만 넣으세요. (예: "Kendall-Jackson Vintner's Reserve Chardonnay")
- 텍스트가 흐릿해 확신이 없는 항목은 지어내지 말고 빈 문자열로 두세요.

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
          name: { type: 'STRING', description: '공식 로마자(영문/원어) 명칭. 생산자+제품명 형식, 빈티지 연도 제외, 한글 금지' },
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