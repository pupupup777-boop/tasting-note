// api/_lib/auth.js
// 🔒 서버에서 Firebase ID 토큰을 검증하는 공용 헬퍼.
// - 브라우저가 Authorization: Bearer <ID토큰> 을 보내면, 구글 identitytoolkit API로 유효성을 확인한다.
// - firebase-admin 없이 동작 (추가 패키지·서비스계정 불필요).
// - Vercel은 api/ 안에서 '_'로 시작하는 폴더를 엔드포인트로 노출하지 않으므로 이 파일은 외부에서 호출 불가.
//
// 필요한 환경변수: FIREBASE_API_KEY 또는 VITE_FIREBASE_API_KEY (Firebase 웹 API 키 — 원래 공개되는 값)

export async function requireAuth(req, res) {
  const API_KEY = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: 'Server auth key not configured (FIREBASE_API_KEY)' });
    return null;
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    res.status(401).json({ error: 'Login required' });
    return null;
  }

  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    );
    if (!r.ok) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return null;
    }
    const data = await r.json();
    const u = data.users && data.users[0];
    if (!u || u.disabled) {
      res.status(401).json({ error: 'Invalid token' });
      return null;
    }
    // 익명 계정 차단 (앱 정책: AI 기능은 구글 로그인 회원만)
    const isAnonymous = !(u.providerUserInfo && u.providerUserInfo.length > 0);
    if (isAnonymous) {
      res.status(403).json({ error: 'Google login required' });
      return null;
    }
    return { uid: u.localId, email: u.email || '' };
  } catch (e) {
    res.status(500).json({ error: 'Auth check failed' });
    return null;
  }
}
