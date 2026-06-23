// api/insights.js
// 취향분석 AI. mode='taste'(내 취향 총평) 또는 mode='recommend'(취향 밖 다른 스타일 추천).
// 사용자가 매긴 점수(overallRating)와 맛 지표(ratings), 아로마에 가중치를 두고 분석한다.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server API key not configured' });
  }

  const { mode, profile, liquorName } = req.body || {};
  if (!profile || !Array.isArray(profile) || profile.length === 0) {
    return res.status(400).json({ error: 'profile(기록 데이터)가 필요합니다' });
  }

  const cat = liquorName || '술';
  const dataJson = JSON.stringify(profile);

  let instruction;
  if (mode === 'recommend') {
    instruction =
      `당신은 한국어로 답하는 따뜻한 소믈리에입니다. 아래는 사용자가 '${cat}' 카테고리에서 지금까지 기록한 시음 노트입니다(각 항목: 이름 name, 스타일 style, 지역 region, 품종 grape, 종합점수 rating(1~100), 맛지표 palate, 아로마 aromas). ` +
      `사용자가 '높은 점수(rating)'를 준 기록과 자주 고른 아로마/맛지표를 취향의 핵심으로 삼되, 이번에는 '${cat}' 안에서 사용자가 '아직 마셔보지 않았거나 적게 마신 다른 스타일'을 추천하세요. ` +
      `예를 들어 레드 와인만 마셨다면 화이트/스파클링/디저트 와인을, 특정 위스키 스타일만 마셨다면 다른 캐스크/지역 스타일을 추천하는 식입니다. ` +
      `사용자의 취향과 어떻게 연결되는지(왜 좋아할 만한지) 근거를 들어 설명하세요. 과장 없이 친근하고 구체적으로.`;
  } else {
    instruction =
      `당신은 한국어로 답하는 따뜻한 소믈리에입니다. 아래는 사용자가 '${cat}' 카테고리에서 지금까지 기록한 시음 노트입니다(각 항목: 이름 name, 스타일 style, 지역 region, 품종 grape, 종합점수 rating(1~100), 맛지표 palate, 아로마 aromas). ` +
      `특히 사용자가 '높은 점수(rating)'를 준 술과 그때 고른 아로마/맛지표에 가중치를 두어, 단순히 무엇을 마셨는지가 아니라 '무엇을 높게 평가했는지'를 중심으로 '${cat}'에 대한 취향을 해석하세요. ` +
      `선호하는 스타일·품종·맛의 경향을 짚어주고, '${cat}' 취향 안에서 다음에 시도하면 좋을 만한 것도 한두 개 제안하세요. 과장 없이 친근하고 구체적으로.`;
  }

  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: `${instruction}\n\n[사용자 시음 기록 JSON]\n${dataJson}` }]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: '한 줄 제목 (예: "풀바디 레드를 사랑하는 당신")' },
          body: { type: 'STRING', description: '2~4문장의 분석/추천 본문' },
          items: {
            type: 'ARRAY',
            description: 'taste면 취향 포인트, recommend면 추천 스타일 목록 (2~4개)',
            items: {
              type: 'OBJECT',
              properties: {
                label: { type: 'STRING', description: '키워드/스타일 이름' },
                desc: { type: 'STRING', description: '한 줄 설명' }
              },
              required: ['label', 'desc']
            }
          }
        },
        required: ['title', 'body', 'items']
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
    return res.status(500).json({ error: 'Insights failed', detail: String(err) });
  }
}