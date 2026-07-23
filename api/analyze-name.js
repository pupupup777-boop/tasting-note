import { requireAuth } from './_lib/auth.js';

// api/analyze-name.js
// 사진 대신 "이름"으로 주류 정보를 채운다.
// 1) 빠른 구조화 출력(responseSchema, 구글검색 없음)으로 우선 시도 — 빠르고 503 적음
// 2) 결과가 부실하면(지역·생산자 비었으면) 그때만 구글검색(google_search)으로 보강 — 부르고뉴 등 애매한 것 대응
// 503/429는 재시도.

const MODEL = 'gemini-2.5-flash';

async function callGemini(key, payload, maxRetries = 4) {
  let delay = 800;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      if ((r.status === 503 || r.status === 429) && i < maxRetries - 1) {
        await new Promise(res => setTimeout(res, delay));
        delay = Math.min(delay * 2, 3000);
        continue;
      }
      if (!r.ok) return { ok: false, status: r.status, text: await r.text() };
      const j = await r.json();
      const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text;
      return { ok: true, raw };
    } catch (e) {
      if (i === maxRetries - 1) return { ok: false, status: 500, text: String(e) };
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 2, 3000);
    }
  }
  return { ok: false, status: 503, text: 'exhausted' };
}

function parseJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim()); }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 🔒 로그인(구글 계정) 검증 — 토큰 없거나 무효면 여기서 401/403 응답 후 종료
  const authedUser = await requireAuth(req, res);
  if (!authedUser) return;

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Server API key not configured' });

  const { name, liquorName } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name(제품 이름)이 필요합니다' });

  const cat = liquorName || '주류';

  // 1) 빠른 구조화 시도
  const fastPrompt =
    `사용자가 입력한 '${cat}' 제품 이름: "${name}". 아는 정보를 채우되 모르는 항목은 추측 말고 빈 문자열로 두세요. ` +
    `와인(특히 부르고뉴/보르도)은 생산자(Domaine/Château)와 아펠라시옹(원산지명)을 구분해 producer/region에 각각 넣으세요. ` +
    `name은 반드시 공식 로마자(영문/원어) 표기로 보정하세요(한글로 입력됐어도 영문 정식 명칭으로 변환, 빈티지 연도 제외, '생산자 + 제품명' 형식). detectedCategory는 wine/whiskey/sake/beer 중 택일.`;

  const schema = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' }, type: { type: 'STRING' }, region: { type: 'STRING' },
      vintage: { type: 'STRING' }, grape: { type: 'STRING' }, producer: { type: 'STRING' },
      detectedCategory: { type: 'STRING', enum: ['wine', 'whiskey', 'sake', 'beer'] }
    },
    required: ['name', 'type', 'detectedCategory']
  };

  const fast = await callGemini(GEMINI_API_KEY, {
    contents: [{ role: 'user', parts: [{ text: fastPrompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
  });

  let result = fast.ok ? parseJson(fast.raw) : null;

  // 2) 결과가 부실하면 구글검색으로 보강
  const sparse = !result || (!result.region && !result.producer);
  if (sparse) {
    const searchPrompt =
      `'${cat}' 제품 "${name}"에 대해 웹 검색으로 정보를 찾아 아래 JSON만 출력(설명·코드블록 금지). 모르면 빈 문자열:\n` +
      `{"name":"공식 로마자 명칭(생산자+제품명, 빈티지·한글 금지)","type":"세부종류","region":"지역/국가","vintage":"연도(모르면 빈칸)","grape":"품종/원료","producer":"생산자","detectedCategory":"wine|whiskey|sake|beer"}`;
    const searched = await callGemini(GEMINI_API_KEY, {
      contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
      tools: [{ google_search: {} }]
    }, 3);
    const searchedData = searched.ok ? parseJson(searched.raw) : null;
    if (searchedData) {
      // 검색 결과로 빈 항목 채우기 (기존 값 우선, 빈 곳만 보강)
      result = {
        name: (result?.name || searchedData.name || name),
        type: (result?.type || searchedData.type || ''),
        region: (result?.region || searchedData.region || ''),
        vintage: (result?.vintage || searchedData.vintage || ''),
        grape: (result?.grape || searchedData.grape || ''),
        producer: (result?.producer || searchedData.producer || ''),
        detectedCategory: (result?.detectedCategory || searchedData.detectedCategory || 'wine')
      };
    }
  }

  if (!result) {
    return res.status(fast.status || 502).json({ error: 'Analyze-name failed', detail: fast.text || 'no result' });
  }
  return res.status(200).json(result);
}