import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, setDoc, updateDoc, arrayUnion, getDoc, deleteDoc, getDocs } from 'firebase/firestore';

const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY || "";

const fallbackConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: "tasting-note-six.vercel.app", // 🔑 [사파리 로그인 수정] 앱과 같은 도메인으로 인증 처리 (vercel.json이 /__/auth/* 를 firebase로 프록시)
  projectId: "chill-sip",
  storageBucket: "chill-sip.firebasestorage.app",
  messagingSenderId: "597973066423",
  appId: "1:597973066423:web:cd9b1bea283855c30ca332",
  measurementId: "G-VLN1Y7FWR5"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : fallbackConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Safe app UID binding
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'wine-tasting-app';
const appId = rawAppId.replace(/\//g, '_');

// ⚠️ [레벨2] Gemini API 키는 더 이상 브라우저에 두지 않는다.
// 키는 서버(api/search.js, api/analyze.js)의 환경변수(GEMINI_API_KEY)에서만 사용된다.

const LIQUOR_CONFIG = {
  wine: {
    id: 'wine', name: '와인', icon: '🍷', theme: 'rose',
    criteria: [
      { id: 'sweetness', label: '당도 (Sweetness)', minLabel: 'Dry', maxLabel: 'Sweet' },
      { id: 'acidity', label: '산미 (Acidity)', minLabel: 'Low', maxLabel: 'High' },
      { id: 'tannin', label: '타닌 (Tannin) *레드전용', minLabel: 'Low', maxLabel: 'High' },
      { id: 'body', label: '바디감 (Body)', minLabel: 'Light', maxLabel: 'Full' },
      { id: 'mousse', label: '기포감 (Mousse) *샴페인전용', minLabel: 'Fine', maxLabel: 'Strong' },
      { id: 'finish', label: '여운 (Finish)', minLabel: 'Short', maxLabel: 'Long' },
      { id: 'balance', label: '균형감 (Balance)', minLabel: 'Bad', maxLabel: 'Good' }
    ],
    subTypes: {
      red: {
        name: '레드 와인',
        aromas: [
          { category: '과일 (FRUIT)', items: ['체리', '라즈베리', '딸기', '자두', '블랙베리', '블랙커런트', '건과일(말린과일)'] },
          { category: '식물 / 허브 (HERBAL)', items: ['허브', '민트', '유칼립투스', '피망(그린)'] },
          { category: '스파이스 (SPICE)', items: ['후추', '시나몬', '정향', '감초'] },
          { category: '오크 / 숙성 (OAK / AGING)', items: ['바닐라', '토스트', '초콜릿', '커피', '스모키', '코코아'] },
          { category: '숙성 / 복합 (DEVELOPMENT)', items: ['가죽', '버섯', '흙(earthy)', '트러플'] }
        ],
        excludeCriteria: ['mousse']
      },
      white: {
        name: '화이트 와인',
        aromas: [
          { category: '과일 (FRUIT)', items: ['레몬', '라임', '자몽', '사과', '배', '복숭아', '살구', '열대과일', '멜론'] },
          { category: '플로럴 (FLORAL)', items: ['아카시아', '자스민', '장미', '백합', '국화'] },
          { category: '오크 / 숙성 (OAK / AGING)', items: ['버터', '바닐라', '토스트', '헤이즐넛', '아몬드'] },
          { category: '허브 / 식물 (HERBAL / VEGETAL)', items: ['허브', '풀', '민트', '피망', '아스파라거스'] },
          { category: '기타 (OTHER)', items: ['미네랄(돌, 석회질)', '꿀', '페트롤(석유향)', '스모키'] }
        ],
        excludeCriteria: ['tannin', 'mousse']
      },
      champagne: {
        name: '샴페인 / 스파클링',
        aromas: [
          { category: '과일 (FRUIT)', items: ['청사과', '레몬', '라임', '배', '자몽', '복숭아'] },
          { category: '효모 / 브레드 (YEAST / BREAD)', items: ['브리오슈', '토스트', '버터', '크림', '이스트'] },
          { category: '숙성 / 견과류 (NUTTY / AGED)', items: ['아몬드', '헤이즐넛', '호두', '꿀', '버섯'] },
          { category: '기타 (OTHER)', items: ['미네랄(돌, 초크)', '스모키', '오크'] }
        ],
        excludeCriteria: ['tannin']
      },
      desert: {
        name: '디저트 와인 (귀부/아이스와인)',
        aromas: [
          { category: '달콤한 과일 (SWEET FRUIT)', items: ['말린 살구', '망고', '파인애플', '무화과', '잼', '오렌지 마멀레이드'] },
          { category: '꿀 / 숙성 (HONEY & AGED)', items: ['꿀', '밀랍', '메이플 시럽', '카라멜', '바닐라'] },
          { category: '기타 / 숙성 (OTHER)', items: ['계피', '호두', '정향', '버섯', '지방질/유분향'] }
        ],
        excludeCriteria: ['tannin', 'mousse']
      }
    }
  },
  whiskey: {
    id: 'whiskey', name: '위스키', icon: '🥃', theme: 'amber',
    aromas: [
      { category: '기본 향', items: ['몰트', '카라멜', '바닐라', '초콜릿', '꿀', '메이플시럽'] },
      { category: '과일/꽃', items: ['건과일', '건포도', '시트러스', '사과', '배', '청포도', '꽃향'] },
      { category: '스파이스/피트', items: ['피트', '스모크', '요오드(병원향)', '후추', '시나몬', '정향', '육두구'] },
      { category: '오크/견과', items: ['오크', '삼나무', '호두', '아몬드', '헤이즐넛', '가죽'] }
    ],
    criteria: [
      { id: 'body', label: '바디감', minLabel: 'Light', maxLabel: 'Full' },
      { id: 'peat', label: '피트/스모크', minLabel: 'None', maxLabel: 'Heavy' },
      { id: 'spicy', label: '스파이시', minLabel: 'Mild', maxLabel: 'Strong' },
      { id: 'finish', label: '피니시 여운', minLabel: 'Short', maxLabel: 'Long' }
    ]
  },
  sake: {
    id: 'sake', name: '사케/전통주', icon: '🍶', theme: 'blue',
    aromas: [
      { category: '과일/꽃', items: ['사과', '멜론', '바나나', '청포도', '흰꽃', '복숭아'] },
      { category: '곡물/감칠맛', items: ['쌀기울', '누룩', '찐쌀', '밤', '버섯', '감칠맛(우마미)'] },
      { category: '기타', items: ['요구르트', '치즈', '견과류', '흙', '카라멜'] }
    ],
    criteria: [
      { id: 'sweetness', label: '단맛', minLabel: 'Dry', maxLabel: 'Sweet' },
      { id: 'acidity', label: '신맛', minLabel: 'Low', maxLabel: 'High' },
      { id: 'umami', label: '감칠맛', minLabel: 'Light', maxLabel: 'Rich' },
      { id: 'body', label: '바디감', minLabel: 'Light', maxLabel: 'Full' }
    ]
  },
  beer: {
    id: 'beer', name: '수제 맥주', icon: '🍺', theme: 'yellow',
    aromas: [
      { category: '몰트/효모', items: ['식빵', '비스킷', '카라멜', '커피', '초콜릿', '바나나(효모)', '곡물'] },
      { category: '홉', items: ['시트러스', '자몽', '오렌지', '열대과일', '망고', '솔잎', '풀잎', '꽃향'] },
      { category: '기타', items: ['향신료', '허브', '산미(신맛)', '베리류'] }
    ],
    criteria: [
      { id: 'bitterness', label: '쓴맛 (IBU)', minLabel: 'Low', maxLabel: 'High' },
      { id: 'carbonation', label: '탄산감', minLabel: 'Flat', maxLabel: 'Sparkling' },
      { id: 'malt', label: '몰트 풍미', minLabel: 'Light', maxLabel: 'Rich' },
      { id: 'hop', label: '홉 풍미', minLabel: 'Mild', maxLabel: 'Strong' }
    ]
  }
};

const getThemeClasses = (theme) => {
  const map = {
    rose: { bg: 'bg-rose-50/70', text: 'text-rose-900', border: 'border-rose-100', btnBg: 'bg-rose-800 hover:bg-rose-900', gradient: 'from-rose-950 to-indigo-950', bar: 'bg-rose-800' },
    amber: { bg: 'bg-amber-50/70', text: 'text-amber-950', border: 'border-amber-100', btnBg: 'bg-amber-800 hover:bg-amber-950', gradient: 'from-amber-950 to-amber-900', bar: 'bg-amber-800' },
    blue: { bg: 'bg-slate-100/70', text: 'text-slate-900', border: 'border-slate-200', btnBg: 'bg-slate-800 hover:bg-slate-900', gradient: 'from-slate-900 to-indigo-900', bar: 'bg-slate-800' },
    yellow: { bg: 'bg-amber-50/40', text: 'text-yellow-950', border: 'border-amber-200/50', btnBg: 'bg-yellow-700 hover:bg-yellow-850', gradient: 'from-yellow-950 to-amber-950', bar: 'bg-yellow-600' }
  };
  return map[theme] || map.rose;
};

const Icon = ({ name, className = "w-5 h-5" }) => {
  const icons = {
    Camera: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z" />,
    Menu: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />,
    X: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
    PlusCircle: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 0v2m0-2h2m-2 0H9m12 0a9 9 0 11-18 0a9 9 0 0118 0z" />,
    ChevronDown: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />,
    ChevronUp: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />,
    Award: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />,
    ShieldCheck: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
    Search: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
    Users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    Wine: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v10m0 0a4 4 0 11-8 0m8 0a4 4 0 118 0M6 22h12M12 12v10" />,
    Star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.246.588 1.81l-3.974 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.97-2.888c-.77-.564-.372-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />,
    DollarSign: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0a9 9 0 0118 0z" />,
    Info: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0a9 9 0 0118 0z" />,
    BookOpen: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
    MapPin: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <circle cx="12" cy="11" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </>
    ),
    Send: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />,
    Check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />,
    Loader2: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />,
    List: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
    BarChart3: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M18 17V9M13 17V5M8 17v-7" />,
    Trash: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  };
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {icons[name] || <circle cx="12" cy="12" r="10" strokeWidth="2" />}
    </svg>
  );
};

const formatTimeAgo = (timestamp) => { if (!timestamp) return ''; const diff = Date.now() - timestamp; const seconds = Math.floor(diff / 1000); if (seconds < 60) return '방금 전'; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}분 전`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}시간 전`; const days = Math.floor(hours / 24); if (days < 7) return `${days}일 전`; const date = new Date(timestamp); return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`; };

// 🔑 [캐싱] 와인 이름을 공용 카탈로그 조회용 키로 정규화 (대소문자/공백/특수문자 정리 → 매칭률 ↑, Firestore 문서ID 안전)
const normalizeWineName = (name) => {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\s+/g, '')          // 공백 제거
    .replace(/[\/\\#?%.]/g, '')   // Firestore 문서ID에 위험한 문자 제거
    .trim()
    .slice(0, 300);               // 키 길이 안전장치
};

const compressImage = (base64Str, maxWidth = 400) => {
  return new Promise((resolve) => {
    let img = new Image();
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let ratio = maxWidth / img.width;
      if (ratio > 1) ratio = 1;
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      let ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    // ✅ [멈춤 방지] 이미지 로드 실패 시에도 Promise를 반드시 풀어준다 (원본 그대로 반환)
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
};

const FractionalStarRating = ({ value, onChange, onSave }) => {
  const [hoverValue, setHoverValue] = useState(null);
  const ratingRef = useRef(null);
  const displayValue = hoverValue !== null ? hoverValue : (value || 0);

  // 위치 → 0.1 단위 점수 (0.0 ~ 5.0)
  const computeFromX = (clientX) => {
    if (!ratingRef.current) return 0;
    const rect = ratingRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.round(percent * 5 * 10) / 10; // 0.1 단위
  };

  const handleMouseMove = (e) => setHoverValue(computeFromX(e.clientX));
  const handleMouseLeave = () => setHoverValue(null);
  const handleTouchMove = (e) => { if (e.touches[0]) setHoverValue(computeFromX(e.touches[0].clientX)); };
  const commit = (v) => { if (onChange) onChange(v); };
  const handleClick = (e) => commit(computeFromX(e.clientX));
  const handleTouchEnd = () => { commit(displayValue); setHoverValue(null); };

  return (
    <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-xl border border-gray-100 shadow-sm">
      <div
        ref={ratingRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex gap-0.5 cursor-pointer py-1 select-none"
        style={{ touchAction: 'none' }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fillPct = Math.round(Math.min(Math.max(displayValue - (star - 1), 0), 1) * 100); // 0~100
          return (
            <div key={star} className="relative w-6 h-6 transition-transform active:scale-110">
              {/* 바탕(회색) 별 */}
              <Icon name="Star" className="w-6 h-6 text-gray-200 fill-current absolute inset-0" />
              {/* 채워지는(금색) 별 — 게이지처럼 왼쪽부터 fillPct%만큼 */}
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fillPct}%` }}>
                <Icon name="Star" className="w-6 h-6 text-amber-400 fill-current" />
              </div>
            </div>
          );
        })}
      </div>
      <span className="text-sm font-black text-amber-500 font-mono shrink-0 bg-amber-50/50 px-2 py-0.5 rounded border border-amber-100">{displayValue.toFixed(1)}</span>
    </div>
  );
};

// 🍷 주종/스타일별 잔 모양 정의 (viewBox 0 0 200 250 기준)
const GLASS_CONFIG = {
  red: { color: '#6B1F38',
    outline: 'M 75 40 C 40 40, 25 120, 100 160 C 175 120, 160 40, 125 40 M 100 160 L 100 230 M 65 230 L 135 230',
    fillPath: 'M 75 40 C 40 40, 25 120, 100 160 C 175 120, 160 40, 125 40 Z', top: 40, bottom: 160 },
  white: { color: '#E9CE74',
    outline: 'M 65 40 C 65 80, 50 140, 100 150 C 150 140, 135 80, 135 40 M 100 150 L 100 230 M 70 230 L 130 230',
    fillPath: 'M 65 40 C 65 80, 50 140, 100 150 C 150 140, 135 80, 135 40 Z', top: 40, bottom: 150 },
  champagne: { color: '#EBD27A', bubbles: true,
    outline: 'M 75 30 L 75 90 C 75 150, 85 160, 100 160 C 115 160, 125 150, 125 90 L 125 30 M 100 160 L 100 230 M 70 230 L 130 230',
    fillPath: 'M 75 30 L 75 90 C 75 150, 85 160, 100 160 C 115 160, 125 150, 125 90 L 125 30 Z', top: 30, bottom: 160 },
  desert: { color: '#D98E2B',
    outline: 'M 70 80 C 70 100, 55 130, 100 140 C 145 130, 130 100, 130 80 M 100 140 L 100 230 M 70 230 L 130 230',
    fillPath: 'M 70 80 C 70 100, 55 130, 100 140 C 145 130, 130 100, 130 80 Z', top: 80, bottom: 140 },
  whiskey: { color: '#B5651D', ice: true,
    outline: 'M 60 80 L 70 230 L 130 230 L 140 80 M 68 215 L 132 215',
    fillPath: 'M 60 80 L 68 215 L 132 215 L 140 80 Z', top: 80, bottom: 215 },
  sake: { color: '#EAE3C8',
    outline: 'M 60 140 C 60 180, 80 210, 100 210 C 120 210, 140 180, 140 140 M 85 210 L 80 230 L 120 230 L 115 210',
    fillPath: 'M 60 140 C 60 180, 80 210, 100 210 C 120 210, 140 180, 140 140 Z', top: 140, bottom: 210 },
  beer: { color: '#D98F1A', foam: true,
    outline: 'M 55 50 L 55 230 L 125 230 L 125 50 M 55 210 L 125 210 M 125 80 C 165 80, 165 180, 125 180 M 125 100 C 145 100, 145 160, 125 160',
    fillPath: 'M 55 50 L 55 210 L 125 210 L 125 50 Z', top: 50, bottom: 210 }
};

// 🍷 종합 만족도: 점수에 따라 잔에 술이 차오르는 시각화 + 슬라이더
const WineGlassRating = ({ score, onChange, glassType }) => {
  const g = GLASS_CONFIG[glassType] || GLASS_CONFIG.red;
  const v = score || 50;
  const [sloshing, setSloshing] = useState(false);
  const settleRef = useRef(null);
  const rawId = useId();
  const clipId = 'glassclip-' + rawId.replace(/[^a-zA-Z0-9]/g, '');
  const STROKE = '#2d3748';

  const fullH = g.bottom - g.top;
  const fillRatio = g.foam ? (v / 100) * 0.82 : v / 100;
  const h = Math.round(fullH * fillRatio);
  const topY = g.bottom - h;

  useEffect(() => () => clearTimeout(settleRef.current), []);

  const handleChange = (e) => {
    onChange(Number(e.target.value));
    setSloshing(true);
    clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => setSloshing(false), 700);
  };

  // 샴페인 기포
  const champagneBubbles = [];
  if (g.bubbles && v >= 6) {
    const cols = [97, 100, 103, 98, 102];
    for (let i = 0; i < 5; i++) {
      const sy = g.bottom - 4 - (i * ((g.bottom - topY) / 6));
      if (sy < topY) continue;
      const dur = 2.2 + i * 0.35;
      champagneBubbles.push(
        <circle key={'cb' + i} cx={cols[i]} cy={sy} r={i % 2 ? 1 : 1.4} fill="#fff8e0" opacity="0.85">
          <animate attributeName="cy" from={sy} to={topY + 3} dur={dur + 's'} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.85;0" dur={dur + 's'} repeatCount="indefinite" />
        </circle>
      );
    }
  }

  // 맥주 거품 + 탄산
  let foamGroup = null;
  if (g.foam) {
    const foamH = Math.round(fullH * (v / 100) * 0.18) + 8;
    const surfY = topY - foamH;
    const blobDefs = [[70, 5, 0], [82, 6, 0.6], [94, 5.5, 1.2], [106, 6, 0.4], [118, 5, 1.5], [76, 4, 0.9], [100, 4.5, 0.3], [112, 4, 1.1]];
    const carbon = [];
    const ccols = [74, 90, 106, 82, 98];
    for (let j = 0; j < 5; j++) {
      const sy2 = g.bottom - 6 - j * 8;
      if (sy2 < topY) continue;
      const dur = 2.0 + j * 0.3;
      carbon.push(
        <circle key={'car' + j} cx={ccols[j]} cy={sy2} r={1.2} fill="#fff6cf" opacity="0.85">
          <animate attributeName="cy" from={sy2} to={topY + 2} dur={dur + 's'} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.85;0" dur={dur + 's'} repeatCount="indefinite" />
        </circle>
      );
    }
    foamGroup = (
      <g clipPath={`url(#${clipId})`}>
        {carbon}
        <rect x="20" width="160" y={surfY} height={foamH + 2} fill="#FBF4DE" />
        {blobDefs.map((b, i) => (
          <circle key={'fb' + i} cx={b[0]} cy={surfY} r={b[1]} fill="#FFFDF5">
            <animate attributeName="cy" values={`${surfY};${surfY - 3};${surfY + 1.5};${surfY}`} dur={(2.6 + b[2]) + 's'} repeatCount="indefinite" begin={b[2] + 's'} />
            <animate attributeName="r" values={`${b[1]};${b[1] + 1.2};${b[1] - 0.6};${b[1]}`} dur={(3.1 + b[2]) + 's'} repeatCount="indefinite" begin={b[2] + 's'} />
          </circle>
        ))}
      </g>
    );
  }

  // 위스키 얼음 (수면 위에 떠서 슬라이드 시 출렁, 멈추면 정착)
  const renderIce = (cx, cy, s, rot, key) => (
    <g key={key}>
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx="3"
        fill="#ffffff" opacity="0.34" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1"
        transform={`rotate(${rot} ${cx} ${cy})`} />
      {sloshing && (
        <animateTransform attributeName="transform" type="translate"
          values="0 0; 0 -2.5; 0 1.2; 0 -0.6; 0 0" dur="0.9s" repeatCount="indefinite" />
      )}
    </g>
  );
  let iceGroup = null;
  if (g.ice && h > 14) {
    const surfaceY = topY + 8;
    const ices = [renderIce(85, surfaceY, 20, 16, 'ice1')];
    if (h > 30) ices.push(renderIce(112, surfaceY + 5, 17, -13, 'ice2'));
    iceGroup = <g clipPath={`url(#${clipId})`}>{ices}</g>;
  }

  return (
    <div>
      <div className="flex justify-center items-end mb-3" style={{ height: 250 }}>
        <svg width="200" height="250" viewBox="0 0 200 250" role="img" aria-label="만족도 잔">
          <defs>
            <clipPath id={clipId}><path d={g.fillPath} /></clipPath>
          </defs>

          {/* 채워지는 술 */}
          <rect x="20" width="160" y={topY} height={h} clipPath={`url(#${clipId})`} fill={g.color} />

          {champagneBubbles.length > 0 && <g clipPath={`url(#${clipId})`}>{champagneBubbles}</g>}
          {foamGroup}
          {iceGroup}

          {/* 유리 광택 */}
          <rect x="20" width="22" y={g.top} height={g.bottom - g.top} clipPath={`url(#${clipId})`} fill="#ffffff" opacity="0.14" />

          {/* 잔 외곽선 (제미나이 라인아트) */}
          <path d={g.outline} fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <input
        type="range"
        min="1"
        max="100"
        value={v}
        onChange={handleChange}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
      />
      <div className="flex justify-between text-[10px] text-gray-400 font-bold px-1 mt-1.5 font-mono">
        <span>1점 (부족함)</span>
        <span>50점 (중간)</span>
        <span>90점 (훌륭함)</span>
        <span>100점 (완벽함)</span>
      </div>
    </div>
  );
};

export default function TastingApp() {
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [listSortKey, setListSortKey] = useState('latest'); // 내 노트 정렬 필터 플래그
  const [filterStyle, setFilterStyle] = useState('all'); // 와인 스타일 필터링
  const [filterRegion, setFilterRegion] = useState('all'); // 와인 지역 필터링
  const [currentView, setCurrentView] = useState('community'); // default to lounge community
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Community & Profiles
  const [userProfile, setUserProfile] = useState({ nickname: '', badge: '🥚 알콜 입문자' });
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityFilter, setCommunityFilter] = useState('all');
  const [communitySort, setCommunitySort] = useState('latest');
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [showShareConfirm, setShowShareConfirm] = useState(false); // 저장 시 라운지 공유 여부 묻는 팝업
  const [verificationCode, setVerificationCode] = useState('');
  const [commentInputs, setCommentInputs] = useState({});
  const [pendingRatings, setPendingRatings] = useState({}); // 🎚️ 드래그로 골라둔(아직 미확정) 별점. 댓글 작성 시 확정됨
  const [replyInputs, setReplyInputs] = useState({});
  const [activeReplyBox, setActiveReplyBox] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // ⚡ [구조 혁신] 리액트 훅의 규칙 엄수: 서브 탭 상태 변수를 최상단 단일 구역으로 전진 배치하여 런타임 프리징 원천 봉쇄
  const [subTab, setSubTab] = useState('lounge');
  const [isCommunityModal, setIsCommunityModal] = useState(false);

  // Form State
  const [selectedLiquorType, setSelectedLiquorType] = useState('wine');
  const [image, setImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [detailsInfo, setDetailsInfo] = useState(null);     // 자세한 정보 결과 {summary, tasting, pairing, trivia}
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsSource, setDetailsSource] = useState('');   // 'cache' | 'ai' : 방금 결과 출처
  const [error, setError] = useState(null);
  const [price, setPrice] = useState('');
  const [ratings, setRatings] = useState({});
  const [selectedAromas, setSelectedAromas] = useState([]);
  const [personalNotes, setPersonalNotes] = useState('');
  const [overallRating, setOverallRating] = useState(0);
  const [expandedAromaCategory, setExpandedAromaCategory] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [selectedDetailNote, setSelectedDetailNote] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null); // 수정 중인 노트 ID 저장용
  const [openComments, setOpenComments] = useState({});
  const [showRankModal, setShowRankModal] = useState(false);

  // Search Grounding
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // 🧠 취향분석 (B: 취향총평 / C: 취향 밖 추천) + 사용량 제한
  const [insightResult, setInsightResult] = useState(null);   // { mode, liquorType, title, body, items }
  const [insightLoading, setInsightLoading] = useState('');    // '' | 'taste' | 'recommend'
  const [insightPickMode, setInsightPickMode] = useState('');  // '' | 'taste' | 'recommend' : 주종 선택 대기 중인 모드
  const [insightTier, setInsightTier] = useState('low');       // 추천 와인 가격대 필터: 'low' | 'mid' | 'high'
  const [usageInfo, setUsageInfo] = useState(null);            // Firestore usage 문서 캐시

  const fileInputRef = useRef(null);
  const searchFileInputRef = useRef(null);
  const [inputMode, setInputMode] = useState('photo'); // 'photo' | 'name' : 추가하기 입력 방식
  const [nameQuery, setNameQuery] = useState('');       // 이름으로 찾기 입력값
  // 📊 필터 및 정렬 연산 장치를 컴포넌트 최상단으로 격리 (무한 루프 에러 완치)
  const safeNotes = useMemo(() => Array.isArray(notes) ? notes : [], [notes]);

  // 🗺️ 전 세계 주요 와인 국가 텍스트 사전 표준화 매핑 딕셔너리
  const getStandardCountry = (regionStr) => {
    if (!regionStr || regionStr === '-') return null;
    const lower = regionStr.toLowerCase();
    if (lower.includes('france') || lower.includes('프랑스') || lower.includes('bourgogne') || lower.includes('burgundy') || lower.includes('bordeaux') || lower.includes('champagne')) return '프랑스';
    // ✅ [버그 수정] lower는 이미 소문자라 대문자 'Piedmont'는 절대 안 잡힘 → 소문자로 정정
    if (lower.includes('italy') || lower.includes('이탈리아') || lower.includes('toscana') || lower.includes('tuscan') || lower.includes('piedmont') || lower.includes('piemonte') || lower.includes('bdm')) return '이탈리아';
    if (lower.includes('chile') || lower.includes('칠레') || lower.includes('colchagua')) return '칠레';
    if (lower.includes('usa') || lower.includes('america') || lower.includes('미국') || lower.includes('napa') || lower.includes('california')) return '미국';
    if (lower.includes('spain') || lower.includes('스페인') || lower.includes('rioja')) return '스페인';
    if (lower.includes('australia') || lower.includes('호주')) return '호주';
    if (lower.includes('zealand') || lower.includes('뉴질랜드')) return '뉴질랜드';

    // 매핑에 없으면 공백 기준 첫 단어를 그대로 반환
    return regionStr.split(/[\s,+/]+/)[0].trim();
  };

  const uniqueRegions = useMemo(() => {
    const countries = new Set();
    safeNotes.forEach(n => {
      const matchedCountry = getStandardCountry(n?.analysisResult?.region);
      if (matchedCountry) countries.add(matchedCountry);
    });
    return ['all', ...Array.from(countries)];
  }, [safeNotes]);

  const processedNotes = useMemo(() => {
    let result = [...safeNotes];

    // 1. 와인 스타일 필터
    if (filterStyle && filterStyle !== 'all') {
      result = result.filter(n => (n?.analysisResult?.wineStyle || 'red') === filterStyle);
    }

    // 2. 국가 단위 필터 (영어/세부명 완벽 클렌징 매칭)
    if (filterRegion && filterRegion !== 'all') {
      result = result.filter(n => getStandardCountry(n?.analysisResult?.region) === filterRegion);
    }

    // 3. 정렬 조건 분기 (가격낮은순 제거 -> 평점높은순 교체 완료)
    result.sort((a, b) => {
      if (listSortKey === 'ratingDesc') return (b?.overallRating || 0) - (a?.overallRating || 0); // 평점 높은순
      if (listSortKey === 'priceDesc') return (Number(b?.price || 0)) - (Number(a?.price || 0)); // 가격 높은순
      return (b?.createdAt || 0) - (a?.createdAt || 0); // 최신 등록순 기본값
    });

    return result;
  }, [safeNotes, listSortKey, filterStyle, filterRegion]);

  useEffect(() => {
    const initAuth = async () => {
      // 1) 먼저 구글 리다이렉트 복귀 결과부터 확인 (홈화면 앱/모바일 로그인 처리)
      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult && redirectResult.user) {
          await finalizeGoogleLogin(redirectResult.user);
          return; // 구글 로그인 완료 → 익명 로그인은 시도하지 않음
        }
      } catch (e) {
        console.error("getRedirectResult error:", e);
      }

      // 2) 리다이렉트 결과도 없고 이미 로그인된 유저도 없을 때만 익명 로그인
      try {
        if (auth.currentUser) return;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth error:", e);
        setUser({ uid: 'mock-user-' + Math.floor(Math.random() * 10000), isAnonymous: true });
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      }
    });
    return () => unsubscribe();
  }, []);

  // ✅ [멈춤 핵심 수정 1/2] 내 노트 구독 — 단일 책임. 중첩 onSnapshot 제거.
  useEffect(() => {
    if (!user?.uid) return;
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');

    const unsubscribe = onSnapshot(
      query(notesRef),
      (snapshot) => {
        const data = [];
        snapshot.forEach((docSnap) => data.push({ id: docSnap.id, ...docSnap.data() }));
        data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setNotes(data);
      },
      (err) => {
        console.error("notes snapshot error:", err);
      }
    );
    return () => unsubscribe();
  }, [user?.uid]);

  // ✅ [멈춤 핵심 수정 2/2] 내 프로필 구독 — 리스너를 단 한 번만 생성하고 정리도 보장.
  useEffect(() => {
    if (!user?.uid) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'info');

    const unsubscribe = onSnapshot(
      profileRef,
      (profileSnap) => {
        if (profileSnap.exists()) {
          setUserProfile((p) => ({ ...p, ...profileSnap.data() }));
        } else {
          const randomNickname = '테이스터_' + Math.floor(1000 + Math.random() * 9000);
          setDoc(profileRef, { nickname: randomNickname, createdAt: Date.now() }, { merge: true })
            .catch((e) => console.error("profile create error:", e));
          setUserProfile((p) => ({ ...p, nickname: randomNickname }));
        }
      },
      (err) => console.error("profile snapshot error:", err)
    );
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const publicRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
    const unsubscribe = onSnapshot(
      query(publicRef),
      (snapshot) => {
        const data = [];
        snapshot.forEach((docSnap) => data.push({ id: docSnap.id, ...docSnap.data() }));
        setCommunityPosts(data);
      },
      (err) => console.error("community snapshot error:", err)
    );
    return () => unsubscribe();
  }, [user?.uid]);

  const userStats = useMemo(() => {
    const stats = {};
    let globalMaxScore = 0;

    communityPosts.forEach(post => {
      const score = post.totalCommunityScore || 0;
      if (score > globalMaxScore) globalMaxScore = score;
      if (!stats[post.userId]) stats[post.userId] = { totalScore: 0, topPostScore: 0 };
      stats[post.userId].totalScore += score;
      if (score > stats[post.userId].topPostScore) stats[post.userId].topPostScore = score;
    });

    const sortedUsers = Object.keys(stats).sort((a, b) => stats[b].totalScore - stats[a].totalScore);

    const userBadges = {};
    sortedUsers.forEach((uid, index) => {
      const s = stats[uid].totalScore;
      const rank = index + 1;

      let badge = '🥚 알콜 입문자';
      if (s >= 2000) badge = '🐉 10. 주신(酒神)';
      else if (s >= 1000) badge = '🌌 9. 술의 요정';
      else if (s >= 500) badge = '👑 8. 주류계의 대부';
      else if (s >= 300) badge = '🥃 7. 캐스크 마스터';
      else if (s >= 150) badge = '🍷 6. 소믈리에';
      else if (s >= 100) badge = '🍸 5. 바텐더';
      else if (s >= 60) badge = '🍶 4. 미식가';
      else if (s >= 30) badge = '🍺 3. 동네 술꾼';
      else if (s >= 10) badge = '🍼 2. 혼술러';

      const isTop = stats[uid].topPostScore === globalMaxScore && globalMaxScore > 0;
      userBadges[uid] = { badge, isTop, totalScore: s, rank };
    });
    return userBadges;
  }, [communityPosts]);

  // 무한 렌더링 루프를 원천 제거한 안전한 토스트 스위치
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
  };

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const resetForm = () => {
    setImage(null);
    setAnalysisResult(null);
    setDetailsInfo(null); setDetailsSource("");
    setPrice('');
    setRatings({});
    setSelectedAromas([]);
    setPersonalNotes('');
    setOverallRating(0);
    setShareToCommunity(false);
    setVerificationCode('CODE-' + Math.floor(1000 + Math.random() * 9000));
  };

  useEffect(() => {
    setVerificationCode('CODE-' + Math.floor(1000 + Math.random() * 9000));
  }, []);

  const [showLoginModal, setShowLoginModal] = useState(false);

  // ✅ [모바일 로그인 수정] 홈화면 추가(standalone) / 모바일 환경 감지기
  // 이런 환경에서는 팝업(signInWithPopup)이 storage 분리 때문에 깨지므로 리다이렉트를 써야 한다.
  const shouldUseRedirect = () => {
    if (typeof window === 'undefined') return false;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator.standalone === true; // iOS 홈화면 추가 앱
    const isMobile = /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent);
    return isStandalone || isMobile;
  };

  // ✅ 로그인 성공 후 프로필을 만들고 상태를 세팅하는 공통 처리 (팝업/리다이렉트 양쪽에서 재사용)
  const finalizeGoogleLogin = async (loggedInUser) => {
    const profileRef = doc(db, 'artifacts', appId, 'users', loggedInUser.uid, 'profile', 'info');
    const profileSnap = await getDoc(profileRef);

    let finalNickname = loggedInUser.displayName || 'Google유저_' + Math.floor(1000 + Math.random() * 9000);

    if (profileSnap.exists() && profileSnap.data().nickname) {
      finalNickname = profileSnap.data().nickname;
    } else {
      await setDoc(profileRef, {
        nickname: finalNickname,
        createdAt: Date.now(),
        provider: 'google'
      }, { merge: true });
    }

    setUserProfile(p => ({ ...p, nickname: finalNickname }));
    setUser(loggedInUser);
    setShowLoginModal(false);
    showToast(`반갑습니다, ${finalNickname}님! 로그인 성공!`, "success");
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();

    // 홈화면 앱/모바일이면 리다이렉트 방식 (팝업이 안 되는 환경)
    if (shouldUseRedirect()) {
      try {
        showToast("구글 로그인 페이지로 이동합니다...", "info");
        await signInWithRedirect(auth, provider);
        // 여기서 페이지가 구글로 떠나고, 돌아오면 위 initAuth의 getRedirectResult가 처리한다.
      } catch (error) {
        console.error("Redirect login error:", error);
        showToast("구글 인증에 실패했거나 취소되었습니다.", "error");
      }
      return;
    }

    // PC 등 일반 환경: 기존 팝업 방식
    try {
      showToast("구글 로그인을 시도합니다...", "info");
      const result = await signInWithPopup(auth, provider);
      await finalizeGoogleLogin(result.user);
    } catch (error) {
      console.error("Login error:", error);
      showToast("구글 인증에 실패했거나 취소되었습니다.", "error");
    }
  };

  const handleUpdateNickname = async () => {
    const nextName = nicknameInput.trim();
    if (!nextName || !user) return;
    try {
      const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'info');
      await setDoc(profileRef, { nickname: nextName }, { merge: true });

      const publicPostsRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
      const querySnap = await getDocs(publicPostsRef);

      for (const postDoc of querySnap.docs) {
        const postData = postDoc.data();
        const targetPostRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postDoc.id);
        let needUpdate = false;
        const updatePayload = {};

        if (postData.userId === user.uid && postData.userName !== nextName) {
          updatePayload.userName = nextName;
          needUpdate = true;
        }

        if (postData.comments && Array.isArray(postData.comments)) {
          const updatedComments = postData.comments.map(comment => {
            if (comment.userId === user.uid && comment.userName !== nextName) {
              return { ...comment, userName: nextName };
            }
            return comment;
          });

          if (JSON.stringify(postData.comments) !== JSON.stringify(updatedComments)) {
            updatePayload.comments = updatedComments;
            needUpdate = true;
          }
        }

        if (needUpdate) {
          await updateDoc(targetPostRef, updatePayload);
        }
      }

      setUserProfile(p => ({ ...p, nickname: nextName }));
      setShowNicknameModal(false);
      showToast("닉네임과 과거 모든 활동 이름이 동기화되었습니다!", "success");
    } catch (err) {
      console.error("Nickname track sync error:", err);
      showToast("닉네임 변경 중 네트워크 오류가 발생했습니다.", "error");
    }
  };

  const handleLogout = async () => {
    try {
      setShowNicknameModal(false);
      setUser(null);
      setUserProfile({ nickname: '', badge: '🥚 알콜 입문자' });
      await auth.signOut();
      const anonResult = await signInAnonymously(auth);
      setUser(anonResult.user);
      showToast("안전하게 로그아웃되었습니다.", "info");
    } catch (err) {
      console.error("Firebase logout lifecycle crash prevented:", err);
      try {
        const fallbackAnon = await signInAnonymously(auth);
        setUser(fallbackAnon.user);
      } catch (e) { }
      showToast("안전하게 로그아웃되었습니다.", "info");
    }
  };

  const navigateTo = (view) => {
    setCurrentView(view);
    setIsMenuOpen(false);
  };

  const handleSearchLiquor = async (queryOverride) => {
    const q = (typeof queryOverride === 'string' ? queryOverride : searchQuery).trim();
    if (!q) return;

    // ✅ [레벨2 - 로그인 게이트] 구글 로그인한 회원만 AI 검색 사용 가능
    if (!user || user.isAnonymous) {
      showToast("AI 검색은 구글 로그인 후 이용할 수 있어요!", "error");
      return;
    }

    setIsSearching(true);
    setSearchResult(null);

    try {
      // 키를 들고 구글을 부르는 건 서버(/api/search)가 한다. 브라우저는 검색어만 보낸다.
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          showToast("이번 달 AI 사용 한도를 초과했어요. 잠시 후 다시 시도해 주세요.", "error");
        } else {
          showToast("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "error");
        }
        console.error("검색 서버 에러:", response.status, errData);
        return;
      }

      const parsed = await response.json();
      setSearchResult(parsed);
    } catch (err) {
      showToast("서버 통신에 실패했습니다.", "error");
      console.error("최종 검색 에러:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // 📷 사진으로 보틀 검색: 라벨 사진 → 이름 추출 → 그 이름으로 검색
  const handleSearchByPhoto = async (base64Image) => {
    if (!user || user.isAnonymous) { showToast("AI 검색은 구글 로그인 후 이용할 수 있어요!", "error"); return; }
    setIsSearching(true);
    setSearchResult(null);
    try {
      const base64Data = base64Image.split(',')[1];
      const exRes = await fetch('/api/extract-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data })
      });
      if (!exRes.ok) {
        showToast("사진에서 정보를 읽지 못했어요. 다른 사진으로 시도해 주세요.", "error");
        setIsSearching(false);
        return;
      }
      const { name } = await exRes.json();
      if (!name || !name.trim()) {
        showToast("라벨에서 이름을 찾지 못했어요. 더 선명한 사진으로 시도해 주세요.", "info");
        setIsSearching(false);
        return;
      }
      setSearchQuery(name);
      await handleSearchLiquor(name); // 추출한 이름으로 바로 검색 (자체적으로 isSearching 처리)
    } catch (err) {
      showToast("사진 검색 중 오류가 발생했어요.", "error");
      console.error("사진 검색 에러:", err);
      setIsSearching(false);
    }
  };

  const triggerSearchPhoto = () => searchFileInputRef.current?.click();
  const handleSearchPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result, 700);
      handleSearchByPhoto(compressed);
    };
    reader.readAsDataURL(file);
    if (searchFileInputRef.current) searchFileInputRef.current.value = '';
  };

  // 🔍 자세한 정보 (역사/테이스팅/페어링, 금액 제외) — 캐시 우선, AI 사용 시에만 카운트
  const handleFetchDetails = async () => {
    if (!analysisResult || !analysisResult.name) { showToast("먼저 라벨을 분석해 주세요.", "info"); return; }
    if (!user || user.isAnonymous) { showToast("자세한 정보는 구글 로그인 후 이용할 수 있어요!", "error"); return; }
    if (detailsLoading) return;

    setDetailsLoading(true);
    setDetailsInfo(null);
    setDetailsSource('');

    const key = normalizeWineName(analysisResult.name);
    const catalogRef = key ? doc(db, 'artifacts', appId, 'public', 'data', 'wine_catalog', key) : null;

    try {
      // 1) 캐시 확인 (catalog 문서의 details 필드) — 있으면 공짜
      if (catalogRef) {
        try {
          const snap = await getDoc(catalogRef);
          if (snap.exists() && snap.data().details) {
            setDetailsInfo(snap.data().details);
            setDetailsSource('cache');
            console.log("[DETAILS CACHE HIT]", key);
            setDetailsLoading(false);
            return; // 카운트 안 함
          }
        } catch (e) { console.error("details 캐시 조회 실패:", e); }
      }

      // 2) 캐시 없음 → 한도 확인 (라벨 5개 풀 공유)
      const allowed = await checkLabelLimit();
      if (!allowed) {
        showToast(`AI 사용은 하루 ${DAILY_LABEL_LIMIT}개까지예요. 자정에 초기화돼요!`, "info");
        setDetailsLoading(false);
        return;
      }

      // 3) AI 호출
      const res = await fetch('/api/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: analysisResult.name })
      });
      if (!res.ok) {
        if (res.status === 429) showToast("이번 달 AI 한도를 초과했어요. 잠시 후 다시 시도해 주세요.", "error");
        else if (res.status === 503) showToast("지금 서버가 혼잡해요. 잠시 후 다시 시도해 주세요.", "error");
        else showToast("자세한 정보를 불러오지 못했어요.", "error");
        setDetailsLoading(false);
        return;
      }
      const parsed = await res.json();
      setDetailsInfo(parsed);
      setDetailsSource('ai');
      setDetailsLoading(false);
      console.log("[DETAILS AI]", analysisResult.name);
      incrementLabelCount(); // AI 사용했으니 카운트 (백그라운드)

      // 카탈로그에 details 저장 (백그라운드) → 다음 사람은 공짜
      if (catalogRef) {
        setDoc(catalogRef, { details: parsed, name: analysisResult.name }, { merge: true }).catch(e => console.error("details 저장 실패:", e));
      }
    } catch (err) {
      showToast("자세한 정보 조회 중 오류가 발생했어요.", "error");
      console.error("자세한 정보 에러:", err);
      setDetailsLoading(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result, 700);
      setImage(compressed);
      analyzeLabel(compressed);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ═══════════════════════════════════════════════
  // 🧠 사용량 제한 (Firestore 서버저장, 우회불가) + 취향분석
  // ═══════════════════════════════════════════════
  const DAILY_LABEL_LIMIT = 5;
  const INSIGHT_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000; // 5일
  const ADMIN_UIDS = ['27zSkaf4TcOO6Xav29dZhXKY5o22']; // 👑 무제한 사용 계정(관리자)
  const isAdmin = !!user && ADMIN_UIDS.includes(user.uid);

  const usageDocRef = () => doc(db, 'artifacts', appId, 'users', user.uid, 'meta', 'usage');
  const getTodayStr = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  const fetchUsage = async () => {
    if (!user || user.isAnonymous) return null;
    try {
      const snap = await getDoc(usageDocRef());
      const data = snap.exists() ? snap.data() : {};
      setUsageInfo(data);
      return data;
    } catch (e) { console.error('사용량 조회 실패:', e); return null; }
  };

  // 라벨분석 한도 체크만 (카운트 안 함). true면 진행 허용, false면 한도초과
  const checkLabelLimit = async () => {
    if (isAdmin) return true; // 👑 관리자는 항상 허용
    try {
      const snap = await getDoc(usageDocRef());
      const data = snap.exists() ? snap.data() : {};
      const today = getTodayStr();
      const count = (data.labelDate === today) ? (data.labelCount || 0) : 0;
      return count < DAILY_LABEL_LIMIT;
    } catch (e) {
      console.error('라벨 한도 체크 실패:', e);
      return true; // 체크 실패 시 막지 않음
    }
  };

  // 라벨분석 카운트 +1 (분석이 성공했을 때만 호출). 관리자도 모니터링용으로 카운트는 쌓임
  const incrementLabelCount = async () => {
    try {
      const ref = usageDocRef();
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};
      const today = getTodayStr();
      const count = (data.labelDate === today) ? (data.labelCount || 0) : 0;
      await setDoc(ref, { labelDate: today, labelCount: count + 1 }, { merge: true });
      setUsageInfo(prev => ({ ...(prev || {}), labelDate: today, labelCount: count + 1 }));
    } catch (e) {
      console.error('라벨 카운트 실패:', e);
    }
  };

  // 취향분석 실행 (mode: 'taste'=내 취향 총평 / 'recommend'=취향 밖 추천)
  const runInsight = async (mode, liquorType) => {
    if (!user || user.isAnonymous) { showToast('취향분석은 구글 로그인 후 이용할 수 있어요!', 'error'); return; }
    if (!safeNotes || safeNotes.length === 0) { showToast('기록이 있어야 분석할 수 있어요. 먼저 시음 노트를 남겨보세요!', 'info'); return; }

    // 선택한 주종의 노트만 추림
    const typeNotes = safeNotes.filter(n => (n.liquorType || n.analysisResult?.detectedCategory) === liquorType);
    if (typeNotes.length === 0) { showToast('이 주종으로 기록한 노트가 없어요!', 'info'); return; }

    const ref = usageDocRef();
    let data = {};
    try { const snap = await getDoc(ref); data = snap.exists() ? snap.data() : {}; } catch (e) { data = {}; }

    const field = mode === 'recommend' ? 'lastRecommendAt' : 'lastTasteAt';
    const last = data[field] || 0;
    const elapsed = Date.now() - last;
    if (!isAdmin && elapsed < INSIGHT_COOLDOWN_MS) { // 👑 관리자는 쿨다운 무시
      const daysLeft = Math.ceil((INSIGHT_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
      showToast(`이 분석은 5일에 한 번만 가능해요. ${daysLeft}일 후에 다시 받아보세요!`, 'info');
      return;
    }

    setInsightLoading(mode);
    setInsightPickMode('');
    setInsightResult(null);

    const liquorName = LIQUOR_CONFIG[liquorType]?.name || liquorType;

    // 선택 주종 노트 → 컴팩트 프로필 (점수/맛지표/아로마 포함)
    const profile = typeNotes.slice(0, 50).map(n => {
      const a = n.analysisResult || {};
      return {
        type: n.liquorType || a.detectedCategory || '',
        name: a.name || '',
        style: a.wineStyle || a.type || '',
        region: a.region || '',
        grape: a.grape || '',
        rating: n.overallRating || 0,
        palate: n.ratings || {},
        aromas: n.selectedAromas || []
      };
    });

    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, profile, liquorName })
      });
      if (!res.ok) {
        if (res.status === 429) showToast('이번 달 AI 한도를 초과했어요. 잠시 후 다시 시도해 주세요.', 'error');
        else showToast('취향분석 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 'error');
        setInsightLoading('');
        return;
      }
      const parsed = await res.json();
      setInsightResult({ mode, liquorType, liquorName, ...parsed });
      setInsightTier('low');

      const now = Date.now();
      await setDoc(ref, { [field]: now }, { merge: true });
      setUsageInfo(prev => ({ ...(prev || {}), [field]: now }));
      console.log(`[INSIGHT ${mode}/${liquorType}] 분석 완료`);
    } catch (e) {
      showToast('서버 통신 오류로 분석이 지연되고 있어요. 잠시 후 다시 시도해 주세요.', 'error');
      console.error('취향분석 에러:', e);
    } finally {
      setInsightLoading('');
    }
  };

  // 취향분석/추가하기 화면 진입 시 사용량(쿨다운/일일카운트) 불러오기
  useEffect(() => {
    if ((currentView === 'insights' || currentView === 'add') && user && !user.isAnonymous) {
      fetchUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, user]);

  const analyzeLabel = async (base64Image) => {
    // ✅ [레벨2 - 로그인 게이트] 구글 로그인한 회원만 AI 라벨분석 사용 가능
    if (!user || user.isAnonymous) {
      showToast("AI 라벨 분석은 구글 로그인 후 이용할 수 있어요!", "error");
      setImage(null);
      return;
    }

    // 🚦 [일일 한도] 하루 5개까지 (자정 리셋). 여기선 체크만, 카운트는 성공 시에만
    const allowed = await checkLabelLimit();
    if (!allowed) {
      showToast(`라벨 분석은 하루 ${DAILY_LABEL_LIMIT}개까지예요. 자정에 초기화돼요!`, "info");
      setImage(null);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null); // 새 분석 시작 시 이전 결과 초기화 (다시 찍기 대응)
    setDetailsInfo(null); setDetailsSource("");
    const base64Data = base64Image.split(',')[1];
    const config = LIQUOR_CONFIG[selectedLiquorType];

    try {
      // ─────────────────────────────────────────────
      // 1단계: 사진에서 "이름"만 가볍게 추출 (싼 호출)
      // ─────────────────────────────────────────────
      let extractedName = '';
      try {
        const nameRes = await fetch('/api/extract-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data })
        });
        if (nameRes.ok) {
          const nameJson = await nameRes.json();
          extractedName = nameJson.name || '';
        }
      } catch (e) {
        console.error("이름 추출 실패(상세분석으로 진행):", e);
      }

      // ─────────────────────────────────────────────
      // 2단계: 공용 카탈로그에서 이름으로 조회 → 있으면 상세분석 스킵 (AI 절약)
      // ─────────────────────────────────────────────
      const lookupKey = normalizeWineName(extractedName);
      if (lookupKey) {
        try {
          const catalogRef = doc(db, 'artifacts', appId, 'public', 'data', 'wine_catalog', lookupKey);
          const snap = await getDoc(catalogRef);
          if (snap.exists()) {
            const cached = snap.data();
            // 주종이 다르면(예: 위스키인데 와인탭) 자동 보정
            if (cached.detectedCategory && LIQUOR_CONFIG[cached.detectedCategory] && cached.detectedCategory !== selectedLiquorType) {
              setSelectedLiquorType(cached.detectedCategory);
            }
            setAnalysisResult(cached);
            setIsAnalyzing(false); // ✅ 즉시 표시
            console.log("[CACHE HIT] 카탈로그에서 불러옴 (AI 미사용):", lookupKey);
            showToast("🍷 주종을 감지했습니다!", "success");
            incrementLabelCount(); // 백그라운드
            return; // 🎯 비싼 상세분석 스킵
          }
        } catch (e) {
          console.error("카탈로그 조회 실패(상세분석으로 진행):", e);
        }
      }

      // ─────────────────────────────────────────────
      // 3단계: 카탈로그에 없으면 상세분석 (기존 비싼 호출) + 카탈로그에 저장
      // ─────────────────────────────────────────────
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, liquorName: config.name })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          setError("이번 달 AI 사용 한도를 초과했어요. 잠시 후 다시 시도해 주세요.");
        } else {
          setError("정밀 분석 중 오류가 발생했습니다. 잠시 후 다시 이미지를 등록해 주세요.");
        }
        showToast("라벨 분석 실패", "error");
        console.error("분석 서버 에러:", response.status, errData);
        setIsAnalyzing(false);
        return;
      }

      const parsed = await response.json();

      if (parsed.detectedCategory && parsed.detectedCategory !== selectedLiquorType) {
        if (LIQUOR_CONFIG[parsed.detectedCategory]) {
          setSelectedLiquorType(parsed.detectedCategory);
        }
      }
      // [와인 세부 변환] 라벨에서 '레드'/'화이트' 키워드 검출 시 스타일 지정
      if (parsed.detectedCategory === 'wine' || selectedLiquorType === 'wine') {
        const isWhite = parsed.type?.toLowerCase().includes('white') || parsed.name?.toLowerCase().includes('white') || parsed.grape?.toLowerCase().includes('chardonnay') || parsed.type?.includes('화이트') || parsed.type?.includes('샴페인');
        parsed.wineStyle = isWhite ? 'white' : 'red';
      }
      setAnalysisResult(parsed);
      setIsAnalyzing(false); // ✅ 결과 즉시 표시 (저장 작업 기다리지 않음)
      console.log("[AI ANALYZE] AI로 새로 분석함:", parsed.name);
      showToast("✨ 주종을 감지했습니다!", "success");
      incrementLabelCount(); // 카운트는 백그라운드로 (await 안 함)

      // 🗂️ 공용 카탈로그에 저장 (백그라운드) → 다음 사람은 AI 상세분석 없이 가져감
      const saveKey = normalizeWineName(parsed.name);
      if (saveKey) {
        const catalogRef = doc(db, 'artifacts', appId, 'public', 'data', 'wine_catalog', saveKey);
        setDoc(catalogRef, {
          name: parsed.name || '',
          type: parsed.type || '',
          region: parsed.region || '',
          vintage: parsed.vintage || '',
          grape: parsed.grape || '',
          producer: parsed.producer || '',
          detectedCategory: parsed.detectedCategory || selectedLiquorType,
          wineStyle: parsed.wineStyle || null,
          createdAt: Date.now(),
          firstBy: user.uid
        }, { merge: true }).catch(e => console.error("카탈로그 저장 실패:", e));
      }

      if (shareToCommunity) {
        if (parsed.isCodeDetected) {
          showToast("실물 인증코드가 성공적으로 감지되었습니다! 즉시 정식인증 마크가 부여됩니다.", "success");
        } else {
          showToast("쪽지 코드를 감지하지 못했습니다. 업로드 시 '집단지성 인증 투표' 상태로 등록됩니다.", "info");
        }
      }
    } catch (err) {
      setError("서버 통신 오류로 정밀 분석이 지연되고 있습니다. 잠시 후 다시 이미지를 등록해 주세요.");
      showToast("라벨 분석 실패", "error");
      console.error("최종 분석 에러:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 🔤 사진 대신 "이름"으로 정보 찾기 (사진 분석과 동일한 캐시/한도/카탈로그 규칙)
  const analyzeByName = async () => {
    if (isAnalyzing) return; // 중복 호출 방지 (엔터+클릭 겹침/연타)
    const q = (nameQuery || '').trim();
    if (!q) { showToast("제품 이름을 입력해 주세요.", "info"); return; }
    if (!user || user.isAnonymous) { showToast("AI 검색은 구글 로그인 후 이용할 수 있어요!", "error"); return; }

    const allowed = await checkLabelLimit();
    if (!allowed) { showToast(`라벨 분석은 하루 ${DAILY_LABEL_LIMIT}개까지예요. 자정에 초기화돼요!`, "info"); return; }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setDetailsInfo(null); setDetailsSource("");
    setImage(null); // 사진 없이 진행
    const config = LIQUOR_CONFIG[selectedLiquorType];

    try {
      // 캐시 확인
      const lookupKey = normalizeWineName(q);
      if (lookupKey) {
        try {
          const catalogRef = doc(db, 'artifacts', appId, 'public', 'data', 'wine_catalog', lookupKey);
          const snap = await getDoc(catalogRef);
          if (snap.exists()) {
            const cached = snap.data();
            if (cached.detectedCategory && LIQUOR_CONFIG[cached.detectedCategory] && cached.detectedCategory !== selectedLiquorType) {
              setSelectedLiquorType(cached.detectedCategory);
            }
            setAnalysisResult(cached);
            setIsAnalyzing(false); // ✅ 즉시 표시
            console.log("[CACHE HIT] (이름검색):", lookupKey);
            showToast("🍷 정보를 불러왔어요!", "success");
            incrementLabelCount();
            setNameQuery('');
            return;
          }
        } catch (e) { console.error("카탈로그 조회 실패:", e); }
      }

      // AI로 정보 생성 (30초 타임아웃 — 무한 로딩 방지)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let res;
      try {
        res = await fetch('/api/analyze-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: q, liquorName: config.name }),
          signal: controller.signal
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          setError("검색이 너무 오래 걸려요. 잠시 후 다시 시도하거나 사진으로 등록해 주세요.");
        } else {
          setError("서버 통신 오류로 검색이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
        }
        showToast("검색 실패", "error");
        setIsAnalyzing(false);
        return;
      }
      clearTimeout(timeoutId);
      if (!res.ok) {
        if (res.status === 429) setError("이번 달 AI 사용 한도를 초과했어요. 잠시 후 다시 시도해 주세요.");
        else if (res.status === 503) setError("지금 검색 서버가 혼잡해요. 잠시 후 다시 시도해 주세요.");
        else setError("정보를 찾는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
        showToast("검색 실패", "error");
        setIsAnalyzing(false);
        return;
      }
      const parsed = await res.json();

      if (parsed.detectedCategory && parsed.detectedCategory !== selectedLiquorType && LIQUOR_CONFIG[parsed.detectedCategory]) {
        setSelectedLiquorType(parsed.detectedCategory);
      }
      if (parsed.detectedCategory === 'wine' || selectedLiquorType === 'wine') {
        const isWhite = parsed.type?.toLowerCase().includes('white') || parsed.name?.toLowerCase().includes('white') || parsed.grape?.toLowerCase().includes('chardonnay') || parsed.type?.includes('화이트') || parsed.type?.includes('샴페인');
        parsed.wineStyle = isWhite ? 'white' : 'red';
      }
      setAnalysisResult(parsed);
      setIsAnalyzing(false); // ✅ 결과 즉시 표시
      console.log("[AI ANALYZE] (이름검색):", parsed.name);
      showToast("✨ 정보를 찾았어요!", "success");
      incrementLabelCount();
      setNameQuery('');

      // 카탈로그 저장 (백그라운드)
      const saveKey = normalizeWineName(parsed.name || q);
      if (saveKey) {
        const catalogRef = doc(db, 'artifacts', appId, 'public', 'data', 'wine_catalog', saveKey);
        setDoc(catalogRef, {
          name: parsed.name || q, type: parsed.type || '', region: parsed.region || '',
          vintage: parsed.vintage || '', grape: parsed.grape || '', producer: parsed.producer || '',
          detectedCategory: parsed.detectedCategory || selectedLiquorType, wineStyle: parsed.wineStyle || null,
          createdAt: Date.now(), firstBy: user.uid
        }, { merge: true }).catch(e => console.error("카탈로그 저장 실패:", e));
      }
    } catch (err) {
      setError("서버 통신 오류로 검색이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
      showToast("검색 실패", "error");
      console.error("이름 검색 에러:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveNote = async (shouldShare = false) => {
    if (!analysisResult) {
      showToast("라벨 분석이 아직 완료되지 않았습니다.", "error");
      return;
    }
    if (!user) {
      showToast("로그인이 완료되지 않았습니다.", "error");
      return;
    }
    setIsSaving(true);
    setShowShareConfirm(false);
    try {
      const smallImage = image ? await compressImage(image, 300) : null;

      const newNote = {
        liquorType: selectedLiquorType,
        analysisResult,
        price: Number(price) || 0,
        ratings,
        selectedAromas,
        personalNotes,
        overallRating,
        thumbnail: smallImage,
        createdAt: Date.now()
      };

      if (editingNoteId) {
        // [수정 모드] 기존 파이어스토어 문서를 찾아 정밀 덮어쓰기 업데이트 시행
        const targetNoteDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'notes', editingNoteId);
        await updateDoc(targetNoteDocRef, newNote);
        setEditingNoteId(null); // 수정 완료 후 플래그 초기화
        showToast("테이스팅 노트가 성공적으로 수정되었습니다!", "success");
      } else {
        // [신규 생성 모드] 새 도큐먼트로 추가
        const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
        const noteDocRef = await addDoc(notesRef, newNote);

        // 라운지 공유 선택 시 공용 컬렉션에도 동시 등록 + 노트에 글ID 기록(게시 상태 추적)
        if (shouldShare) {
          const communityRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
          const postDocRef = await addDoc(communityRef, {
            ...newNote,
            userId: user.uid,
            userName: userProfile.nickname,
            ownerNoteId: noteDocRef.id,
            totalCommunityScore: 0,
            ratings: {}, // 🐛 [버그수정] 별점(0~5) 칸은 비워서 시작. 작성자 종합평가는 overallRating 필드에 따로 보관됨
            originalRatings: ratings,
            comments: [],
            isVerified: true,
            verificationStatus: 'ai_verified',
            votes: { voters: {}, yesCount: 0, noCount: 0 }
          });
          await updateDoc(noteDocRef, { communityPostId: postDocRef.id });
        }
        showToast("테이스팅 노트가 안전하게 저장되었습니다!", "success");
      }

      resetForm();
      navigateTo('list');
    } catch (err) {
      showToast("저장 중 오류가 발생했습니다: " + err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoteVerification = async (postId, voteValue) => {
    if (!user || user.isAnonymous) {
      showToast("정식 구글 로그인 회원만 인증 투표에 참여할 수 있습니다.", "error");
      return;
    }

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postId);
    try {
      const postSnap = communityPosts.find(p => p.id === postId);
      if (!postSnap) return;

      const currentVotes = postSnap.votes || { voters: {}, yesCount: 0, noCount: 0 };
      const currentVoters = currentVotes.voters || {};

      if (currentVoters[user.uid] !== undefined) {
        showToast("이미 이 보틀에 대한 인증 투표를 완료하셨습니다.", "info");
        return;
      }

      const updatedVoters = { ...currentVoters, [user.uid]: voteValue };

      let yesCount = 0;
      let noCount = 0;
      Object.values(updatedVoters).forEach(v => {
        if (v === 'yes') yesCount++;
        if (v === 'no') noCount++;
      });

      const totalVotes = yesCount + noCount;
      let verificationStatus = postSnap.verificationStatus || 'pending_vote';

      if (totalVotes >= 3) {
        const yesRatio = yesCount / totalVotes;
        if (yesRatio >= 0.5) {
          verificationStatus = 'community_verified';
        } else {
          verificationStatus = 'pending_vote';
        }
      }

      await updateDoc(postRef, {
        "votes.voters": updatedVoters,
        "votes.yesCount": yesCount,
        "votes.noCount": noCount,
        verificationStatus,
        isVerified: verificationStatus === 'community_verified' || verificationStatus === 'ai_verified'
      });

      if (selectedDetailNote && selectedDetailNote.id === postId) {
        setSelectedDetailNote(prev => ({
          ...prev,
          verificationStatus,
          votes: { voters: updatedVoters, yesCount, noCount }
        }));
      }

      showToast("실물 인증 투표가 반영되었습니다!", "success");
    } catch (err) {
      console.error("Vote mapping error:", err);
      showToast("투표 처리 중 서버 통신 오류가 발생했습니다.", "error");
    }
  };

  // 🗑️ 라운지 글 삭제 (작성자 본인만)
  const handleDeletePost = async (post) => {
    if (!user || !post) return;
    if (post.userId !== user.uid) { showToast("내가 쓴 글만 삭제할 수 있어요.", "error"); return; }
    if (!window.confirm("이 글을 삭제할까요? 달린 댓글과 평점도 함께 사라지며 되돌릴 수 없어요.")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', post.id));
      // 연결된 내 노트가 있으면 게시 상태 해제
      if (post.ownerNoteId) {
        try { await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', post.ownerNoteId), { communityPostId: '' }); } catch (e) { /* 노트가 이미 없을 수 있음 */ }
      }
      if (selectedDetailNote && selectedDetailNote.id === post.id) setSelectedDetailNote(null);
      showToast("라운지 게시가 취소되었습니다.", "success");
    } catch (err) {
      showToast("삭제 중 오류가 발생했어요.", "error");
      console.error("글 삭제 실패:", err);
    }
  };

  // 📢 내 노트를 라운지에 게시 (미게시 → 게시)
  const handlePublishToLounge = async (note) => {
    if (!user || user.isAnonymous || !note) { showToast("구글 로그인 후 이용할 수 있어요!", "error"); return; }
    if (note.communityPostId) { showToast("이미 라운지에 게시된 노트예요.", "info"); return; }
    try {
      const communityRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
      const postDocRef = await addDoc(communityRef, {
        liquorType: note.liquorType,
        analysisResult: note.analysisResult,
        price: note.price || 0,
        ratings: {},
        originalRatings: note.ratings || {},
        selectedAromas: note.selectedAromas || [],
        personalNotes: note.personalNotes || '',
        overallRating: note.overallRating || 0,
        thumbnail: note.thumbnail || null,
        createdAt: note.createdAt || Date.now(),
        userId: user.uid,
        userName: userProfile.nickname,
        ownerNoteId: note.id,
        totalCommunityScore: 0,
        comments: [],
        isVerified: true,
        verificationStatus: 'ai_verified',
        votes: { voters: {}, yesCount: 0, noCount: 0 }
      });
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', note.id), { communityPostId: postDocRef.id });
      if (selectedDetailNote && selectedDetailNote.id === note.id) {
        setSelectedDetailNote(prev => ({ ...prev, communityPostId: postDocRef.id }));
      }
      showToast("🍷 라운지에 게시되었습니다!", "success");
    } catch (err) {
      showToast("게시 중 오류가 발생했어요.", "error");
      console.error("라운지 게시 실패:", err);
    }
  };

  // 🚫 라운지 게시 취소 (게시 → 미게시). 내 노트 화면에서 호출
  const handleUnpublishFromLounge = async (note) => {
    if (!user || !note || !note.communityPostId) return;
    if (!window.confirm("라운지 게시를 취소할까요? 라운지의 글과 거기 달린 댓글·평점이 사라져요. (내 노트는 그대로 유지돼요.)")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', note.communityPostId));
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', note.id), { communityPostId: '' });
      if (selectedDetailNote && selectedDetailNote.id === note.id) {
        setSelectedDetailNote(prev => ({ ...prev, communityPostId: '' }));
      }
      showToast("라운지 게시가 취소되었습니다.", "success");
    } catch (err) {
      showToast("취소 중 오류가 발생했어요.", "error");
      console.error("게시 취소 실패:", err);
    }
  };

  // 🗑️ 라운지 댓글 삭제 (댓글 작성자 본인만)
  const handleDeleteComment = async (post, comment) => {
    if (!user || !post || !comment) return;
    if (comment.userId !== user.uid) { showToast("내가 쓴 댓글만 삭제할 수 있어요.", "error"); return; }
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    try {
      const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', post.id);
      const updatedComments = (post.comments || []).filter(c => c.id !== comment.id);
      await updateDoc(postRef, { comments: updatedComments });
      if (selectedDetailNote && selectedDetailNote.id === post.id) {
        setSelectedDetailNote(prev => ({ ...prev, comments: updatedComments }));
      }
      showToast("댓글이 삭제되었습니다.", "success");
    } catch (err) {
      showToast("댓글 삭제 중 오류가 발생했어요.", "error");
      console.error("댓글 삭제 실패:", err);
    }
  };

  // 🗑️ 내 개인 테이스팅 노트 삭제
  const handleDeleteMyNote = async (note) => {
    if (!user || !note) return;
    if (!window.confirm("이 노트를 삭제할까요? 되돌릴 수 없어요.")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notes', note.id));
      if (selectedDetailNote && selectedDetailNote.id === note.id) setSelectedDetailNote(null);
      showToast("노트가 삭제되었습니다.", "success");
    } catch (err) {
      showToast("삭제 중 오류가 발생했어요.", "error");
      console.error("노트 삭제 실패:", err);
    }
  };

  const handleAddComment = async (postId) => {
    if (!user || !commentInputs[postId]?.trim()) return;
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postId);
    try {
      const newComment = {
        id: Date.now().toString() + Math.random(), userId: user.uid, userName: userProfile.nickname, text: commentInputs[postId].trim(), createdAt: Date.now()
      };

      // 🎯 댓글 작성 시: 드래그로 골라둔 별점이 있으면 이때 함께 "확정"한다.
      const targetPost = communityPosts.find(p => p.id === postId);
      const pending = pendingRatings[postId];
      const isAuthor = targetPost?.userId === user.uid;
      const alreadyRated = targetPost?.ratings?.[user.uid] != null;

      const updatePayload = { comments: arrayUnion(newComment) };
      let committedRatings = null;
      let committedTotal = null;

      if (pending != null && !isAuthor && !alreadyRated) {
        const updatedRatings = { ...(targetPost?.ratings || {}) };
        updatedRatings[user.uid] = pending;
        const authorId = targetPost?.userId;
        committedTotal = Object.entries(updatedRatings).reduce((acc, [uid, val]) => (uid === authorId ? acc : acc + (Number(val) || 0)), 0);
        committedRatings = updatedRatings;
        updatePayload.ratings = updatedRatings;
        updatePayload.totalCommunityScore = committedTotal;
      }

      await updateDoc(postRef, updatePayload);

      if (selectedDetailNote && selectedDetailNote.id === postId) {
        setSelectedDetailNote(prev => ({
          ...prev,
          comments: [...(prev.comments || []), newComment],
          ...(committedRatings ? { ratings: committedRatings, totalCommunityScore: committedTotal } : {})
        }));
      }

      setCommentInputs(p => ({ ...p, [postId]: '' }));
      if (committedRatings) {
        setPendingRatings(p => { const n = { ...p }; delete n[postId]; return n; });
        showToast(`댓글과 함께 ${pending}점이 확정되었습니다!`, "success");
      }
    } catch (err) {
      showToast("댓글 작성에 실패했습니다.", "error");
    }
  };

  const handleAddReply = async (postId, commentId) => {
    if (!user || !replyInputs[commentId]?.trim()) return;
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postId);
    try {
      const targetPost = communityPosts.find(p => p.id === postId);
      if (!targetPost) return;

      const newReply = {
        id: Date.now().toString() + Math.random(),
        userId: user.uid,
        userName: userProfile.nickname,
        text: replyInputs[commentId].trim(),
        createdAt: Date.now()
      };

      // 기존 댓글 배열을 돌면서 매칭되는 댓글의 replies 내부에 새 대댓글 누적하기
      const updatedComments = (targetPost.comments || []).map(c => {
        if (c.id === commentId) {
          return { ...c, replies: [...(c.replies || []), newReply] };
        }
        return c;
      });

      await updateDoc(postRef, { comments: updatedComments });

      if (selectedDetailNote && selectedDetailNote.id === postId) {
        setSelectedDetailNote(prev => ({ ...prev, comments: updatedComments }));
      }

      setReplyInputs(p => ({ ...p, [commentId]: '' }));
      setActiveReplyBox(null);
      showToast("답글이 성공적으로 등록되었습니다!");
    } catch (err) {
      showToast("답글 작성에 실패했습니다.", "error");
    }
  };

  const renderRatingBar = (criteria) => {
    const theme = getThemeClasses(LIQUOR_CONFIG[selectedLiquorType].theme);
    return (
      <div key={criteria.id} className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="font-medium text-gray-700 text-sm">{criteria.label}</span>
          <span className={`text-xs font-bold ${theme.text} ${theme.bg} px-2 py-1 rounded-full`}>{ratings[criteria.id] || 0}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500 w-10 text-right shrink-0">{criteria.minLabel}</span>
          <div className="flex-1 flex justify-between">
            {[1, 2, 3, 4, 5].map((val) => {
              const isActive = (ratings[criteria.id] || 0) >= val;
              return (
                <button
                  key={val}
                  onClick={() => setRatings(p => ({ ...p, [criteria.id]: val }))}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? `${theme.bar} text-white shadow-md transform scale-105` : 'bg-gray-100 text-gray-400'
                    }`}
                >
                  {val}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-gray-500 w-10 shrink-0">{criteria.maxLabel}</span>
        </div>
      </div>
    );
  };

  const renderAddView = () => {
    const config = LIQUOR_CONFIG[selectedLiquorType];
    const theme = getThemeClasses(config.theme);
    const isRedMode = !analysisResult?.wineStyle || analysisResult?.wineStyle === 'red';
    const wineBgClass = isRedMode ? 'bg-rose-900/10' : 'bg-amber-500/10';
    const wineBorderClass = isRedMode ? 'border-rose-200' : 'border-amber-200';
    const wineTextClass = isRedMode ? 'text-rose-900' : 'text-amber-800';

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {!analysisResult && !isAnalyzing && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto whitespace-nowrap hide-scrollbar flex gap-2 snap-x snap-mandatory">
            {Object.values(LIQUOR_CONFIG).map(liquor => {
              const isSelected = selectedLiquorType === liquor.id;
              const lTheme = getThemeClasses(liquor.theme);
              return (
                <button
                  key={liquor.id}
                  onClick={() => { setSelectedLiquorType(liquor.id); resetForm(); }}
                  className={`snap-center shrink-0 px-5 py-3 rounded-2xl font-bold flex items-center transition-all ${isSelected ? `${lTheme.btnBg} text-white shadow-md transform scale-105` : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                    }`}
                >
                  <span className="mr-2 text-xl">{liquor.icon}</span> {liquor.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

          {user && !user.isAnonymous && (
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-black text-gray-500">📸 오늘의 라벨 분석</span>
              {(() => {
                const today = getTodayStr();
                const used = usageInfo?.labelDate === today ? (usageInfo?.labelCount || 0) : 0;
                if (isAdmin) return <span className="text-[11px] font-black text-amber-600 font-mono">👑 {used}회 사용 · 무제한</span>;
                const left = Math.max(0, DAILY_LABEL_LIMIT - used);
                return <span className={`text-[11px] font-black font-mono ${left === 0 ? 'text-red-500' : 'text-gray-700'}`}>{left}/{DAILY_LABEL_LIMIT}장 남음</span>;
              })()}
            </div>
          )}

          {/* 입력 방식 전환: 사진 / 이름 */}
          <div className="flex gap-1.5 mb-3 bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setInputMode('photo')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${inputMode === 'photo' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>📸 사진 촬영</button>
            <button onClick={() => setInputMode('name')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${inputMode === 'name' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>🔤 이름으로 찾기</button>
          </div>

          {inputMode === 'photo' && (!image ? (
            <div onClick={triggerFileInput} className={`border-2 border-dashed ${theme.border} rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors group flex flex-col items-center justify-center h-48 bg-gray-50/50`}>
              <Icon name="Camera" className={`w-12 h-12 ${theme.text} opacity-50 mb-3`} />
              <p className={`font-medium ${theme.text}`}>라벨 사진 촬영</p>
              <p className="text-xs text-gray-400 mt-1">AI가 품종, 원재료 및 테마를 자동 감지합니다</p>
            </div>
          ) : (
            <div
              onClick={() => { if (!isAnalyzing) triggerFileInput(); }}
              className={`relative rounded-xl overflow-hidden shadow-inner border border-gray-200 group ${isAnalyzing ? '' : 'cursor-pointer'}`}
            >
              <img src={image} alt="Label" className="w-full h-48 object-contain bg-gray-100" />
              {!isAnalyzing && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 active:bg-black/40 flex items-center justify-center transition-colors">
                  <span className="opacity-0 group-hover:opacity-100 active:opacity-100 text-white text-sm font-black flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-full transition-opacity">
                    <Icon name="Camera" className="w-4 h-4" /> 다시 찍기
                  </span>
                </div>
              )}
            </div>
          ))}

          {inputMode === 'name' && (
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isAnalyzing) analyzeByName(); }}
                  placeholder={`${config.name} 이름을 입력하세요 (예: 켄달잭슨 샤르도네)`}
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  onClick={analyzeByName}
                  disabled={isAnalyzing || !nameQuery.trim()}
                  className={`px-4 rounded-xl font-black text-sm shrink-0 transition-all ${isAnalyzing || !nameQuery.trim() ? 'bg-gray-200 text-gray-400' : 'bg-gray-900 text-white active:scale-95'}`}
                >찾기</button>
              </div>
              <p className="text-[11px] text-gray-400 font-medium px-1">📷 사진이 어렵거나 병이 없을 때, 이름만으로 정보를 찾아 노트를 작성할 수 있어요.</p>
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-4 flex flex-col items-center justify-center p-4 bg-gray-50 text-gray-800 rounded-xl border">
              <Icon name="Loader2" className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm font-medium">라벨을 읽어 정보를 찾고 있어요...</p>
            </div>
          )}
          {error && <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">{error}</div>}

          {analysisResult && !isAnalyzing && (
            <div className="mt-6 space-y-4">
              {/* 와인 세부 스타일에 맞춰 버건디 vs 골드 실버 레이아웃 동적 변환 */}
              <div className={`bg-gradient-to-br ${isRedMode ? 'from-rose-950 via-purple-950 to-indigo-950 text-white' : 'from-amber-100 via-yellow-50 to-orange-100 text-amber-950 border border-amber-200/60'} rounded-2xl p-5 shadow-md relative overflow-hidden`}>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-base font-black leading-tight pr-2">{analysisResult.name}</h2>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold backdrop-blur-sm ${isRedMode ? 'bg-white/20 text-white' : 'bg-amber-800/10 text-amber-900'}`}>{analysisResult.type || 'Wine'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className={`block text-[10px] mb-0.5 font-bold ${isRedMode ? 'text-white/50' : 'text-amber-800/60'}`}>지역/국가</span>
                      <span className="font-black block break-words leading-snug">{analysisResult.region || '-'}</span>
                    </div>
                    <div>
                      <span className={`block text-[10px] mb-0.5 font-bold ${isRedMode ? 'text-white/50' : 'text-amber-800/60'}`}>숙성/빈티지</span>
                      <span className="font-mono font-black">{(analysisResult.vintage === "null" || !analysisResult.vintage) ? 'NV' : analysisResult.vintage}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 🔍 자세한 정보 (보틀 백과) */}
              {(() => {
                const today = getTodayStr();
                const used = usageInfo?.labelDate === today ? (usageInfo?.labelCount || 0) : 0;
                const left = Math.max(0, DAILY_LABEL_LIMIT - used);
                return (
                  <div>
                    {!detailsInfo ? (
                      <button
                        onClick={handleFetchDetails}
                        disabled={detailsLoading}
                        className="w-full flex items-center justify-center gap-2 bg-white border border-indigo-200 text-indigo-700 font-black text-sm py-3 rounded-2xl shadow-sm hover:bg-indigo-50 transition-colors disabled:opacity-60"
                      >
                        {detailsLoading ? <><Icon name="Loader2" className="w-4 h-4 animate-spin" /> 정보를 찾고 있어요...</> : <><Icon name="Search" className="w-4 h-4" /> 자세한 정보 보기 {!isAdmin && <span className="text-[10px] opacity-70 font-mono">(오늘 {left}/{DAILY_LABEL_LIMIT})</span>}</>}
                      </button>
                    ) : (
                      <div className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-indigo-900">📖 보틀 백과</span>
                          <span className="text-[9px] font-bold text-gray-400">{detailsSource === 'cache' ? '🍷 저장된 정보' : '✨ 새로 찾음'}</span>
                        </div>
                        {detailsInfo.summary && (
                          <div>
                            <p className="text-[10px] font-black text-indigo-400 mb-0.5">역사 · 특징</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{detailsInfo.summary}</p>
                          </div>
                        )}
                        {detailsInfo.tasting && (
                          <div>
                            <p className="text-[10px] font-black text-indigo-400 mb-0.5">테이스팅 노트</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{detailsInfo.tasting}</p>
                          </div>
                        )}
                        {detailsInfo.pairing && (
                          <div>
                            <p className="text-[10px] font-black text-indigo-400 mb-0.5">페어링 · 팁</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{detailsInfo.pairing}</p>
                          </div>
                        )}
                        {detailsInfo.trivia && (
                          <div>
                            <p className="text-[10px] font-black text-indigo-400 mb-0.5">알아두면 좋은 점</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{detailsInfo.trivia}</p>
                          </div>
                        )}
                        <p className="text-[9px] text-gray-300 font-medium text-center pt-1">AI가 정리한 정보라 일부 부정확할 수 있어요</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">구매 가격</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-xs text-gray-500 font-medium">₩</span></div>
                    <input
                      type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="예: 35000"
                      className="pl-7 w-full bg-gray-50 border border-gray-200 text-xs text-gray-900 rounded-xl block p-3 outline-none font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">와인 빈티지(생산년도)</label>
                  <input
                    type="text"
                    value={(analysisResult?.vintage === "null" || !analysisResult?.vintage) ? "" : analysisResult.vintage}
                    onChange={(e) => setAnalysisResult(p => ({ ...p, vintage: e.target.value }))}
                    placeholder="예: 2020 또는 NV"
                    className="w-full bg-gray-50 border border-gray-200 text-xs text-gray-900 rounded-xl block p-3 outline-none font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}
        </div>



        <div className={`transition-all duration-500 ${analysisResult ? 'opacity-100' : 'opacity-50 pointer-events-none hidden'}`}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center">
              <span className={`w-1.5 h-5 ${theme.bar} rounded-full mr-2`}></span> 맛의 균형 (Palate)
            </h3>
            {/* 현재 와인 스타일(레드/화이트) 직관적 표시기 */}
            {selectedLiquorType === 'wine' && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAnalysisResult(p => ({ ...p, wineStyle: 'red' }))} className={`py-2 text-xs font-black rounded-xl border transition-all ${(!analysisResult?.wineStyle || analysisResult?.wineStyle === 'red') ? 'bg-rose-900 text-white border-rose-950 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>🍷 레드 와인</button>
                <button type="button" onClick={() => setAnalysisResult(p => ({ ...p, wineStyle: 'white' }))} className={`py-2 text-xs font-black rounded-xl border transition-all ${(analysisResult?.wineStyle === 'white') ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>🥂 화이트 와인</button>
                <button type="button" onClick={() => setAnalysisResult(p => ({ ...p, wineStyle: 'champagne' }))} className={`py-2 text-xs font-black rounded-xl border transition-all ${(analysisResult?.wineStyle === 'champagne') ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>🍾 샴페인/스파클링</button>
                <button type="button" onClick={() => setAnalysisResult(p => ({ ...p, wineStyle: 'desert' }))} className={`py-2 text-xs font-black rounded-xl border transition-all ${(analysisResult?.wineStyle === 'desert') ? 'bg-amber-800 text-white border-amber-900 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>🍯 디저트 와인</button>
              </div>
            )}
            {config.criteria?.map(criteria => {
              // 화이트 와인일 때 타닌 항목 숨기기 필터링
              const currentStyle = analysisResult?.wineStyle || 'red';
              if (selectedLiquorType === 'wine' && config.subTypes?.[currentStyle]?.excludeCriteria?.includes(criteria.id)) {
                return null;
              }
              return renderRatingBar(criteria);
            })}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center">
              <span className="w-1.5 h-5 bg-emerald-600 rounded-full mr-2"></span> 느껴지는 아로마 & 부케 (Aromas)
            </h3>
            <p className="text-sm text-gray-400 mb-4">코로 느낀 향들을 모두 골라 담아보세요.</p>
            <div className="space-y-3">
              {(() => {
                // 와인일 경우 선택된 스타일에 맞는 전용 아로마 리스트 바인딩
                let currentAromas = config.aromas || [];
                if (selectedLiquorType === 'wine') {
                  const styleKey = analysisResult?.wineStyle || 'red';
                  currentAromas = config.subTypes?.[styleKey]?.aromas || [];
                }

                return currentAromas.map((cat) => (
                  <div key={cat.category} className="border border-gray-100 rounded-xl overflow-hidden">
                    <button type="button" onClick={() => setExpandedAromaCategory(p => p === cat.category ? null : cat.category)} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                      <span className="font-medium text-gray-700 text-sm">{cat.category}</span>
                      {expandedAromaCategory === cat.category ? <Icon name="ChevronUp" className="w-4 h-4 text-gray-500" /> : <Icon name="ChevronDown" className="w-4 h-4 text-gray-500" />}
                    </button>
                    {expandedAromaCategory === cat.category && (
                      <div className="p-3 bg-white flex flex-wrap gap-1.5 border-t border-gray-100">
                        {cat.items.map(aroma => {
                          const isSelected = selectedAromas.includes(aroma);
                          return (
                            <button
                              key={aroma} type="button" onClick={() => setSelectedAromas(p => isSelected ? p.filter(a => a !== aroma) : [...p, aroma])}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isSelected ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-emerald-50'}`}
                            >
                              {isSelected && <Icon name="Check" className="w-3 h-3 inline mr-1" />} {aroma}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <span className="w-1.5 h-5 bg-indigo-600 rounded-full mr-2"></span> 종합 평가 & 오늘의 한줄평
            </h3>

            <div className={`mb-6 p-5 rounded-2xl border ${wineBorderClass} ${wineBgClass} shadow-sm transition-all duration-300`}>
              <div className="flex justify-between items-center mb-3">
                <label className="text-xs font-black text-gray-700 uppercase tracking-tight flex items-center gap-1">
                  {config.icon} {config.name} 잔 만족도 테이스팅 (1 ~ 100)
                </label>
                <span className={`text-2xl font-mono font-black bg-white px-3 py-1 rounded-xl shadow-sm border ${wineBorderClass} ${wineTextClass}`}>
                  {overallRating || 50} <span className="text-xs font-medium text-gray-400">점</span>
                </span>
              </div>

              {/* 🍷 주종/스타일에 맞는 잔에 술이 차오르는 만족도 시각화 */}
              <WineGlassRating
                score={overallRating}
                onChange={setOverallRating}
                glassType={selectedLiquorType === 'wine' ? (analysisResult?.wineStyle || 'red') : selectedLiquorType}
              />
            </div>

            <textarea
              rows="3" value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)}
              placeholder={`${config.name}의 느낌이나 기억하고 싶은 한줄평을 적어주세요.`}
              className="w-full px-4 py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none text-sm font-medium"
            />
          </div>

          <div className="pt-2">
            <button
              onClick={() => { if (editingNoteId) { handleSaveNote(false); } else { setShowShareConfirm(true); } }}
              disabled={isSaving || !overallRating}
              className={`w-full font-black text-sm h-14 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${isSaving || !overallRating ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-black text-white active:scale-95'}`}
            >
              {isSaving && <Icon name="Loader2" className="animate-spin w-4 h-4" />}
              {editingNoteId ? "테이스팅 노트 수정완료" : "테이스팅 노트 저장하기"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderInsightsView = () => {
    const cooldownDays = (field) => {
      const last = usageInfo?.[field] || 0;
      const elapsed = Date.now() - last;
      if (elapsed >= INSIGHT_COOLDOWN_MS) return 0;
      return Math.ceil((INSIGHT_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
    };
    const tasteCd = cooldownDays('lastTasteAt');
    const recCd = cooldownDays('lastRecommendAt');
    const today = getTodayStr();
    const usedToday = usageInfo?.labelDate === today ? (usageInfo?.labelCount || 0) : 0;
    const noNotes = !safeNotes || safeNotes.length === 0;

    // 내가 기록한 주종 집계 (많은 순)
    const typeCounts = {};
    safeNotes.forEach(n => { const t = n.liquorType || n.analysisResult?.detectedCategory; if (t) typeCounts[t] = (typeCounts[t] || 0) + 1; });
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="BarChart3" className="w-6 h-6 text-indigo-500" />
            <h2 className="text-lg font-black">나의 취향 분석</h2>
          </div>
          <p className="text-gray-500 text-xs font-medium">지금까지 <b className="text-gray-800">{safeNotes.length}병</b>을 기록하셨어요. AI가 당신이 매긴 점수와 취향을 분석해드려요.</p>
          <p className="text-[10px] text-gray-400 mt-1.5 font-mono">{isAdmin ? `👑 무제한 · 오늘 라벨 ${usedToday}회 사용` : `오늘 라벨분석 ${usedToday}/${DAILY_LABEL_LIMIT} · 취향분석은 5일에 1번`}</p>
        </div>

        {/* B: 내 취향 총평 / C: 취향 밖 추천 버튼 → 누르면 주종 선택 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setInsightPickMode(insightPickMode === 'taste' ? '' : 'taste')}
            disabled={insightLoading !== '' || noNotes || (!isAdmin && tasteCd > 0)}
            className={`p-4 rounded-2xl border text-left transition-all ${insightLoading !== '' || noNotes || (!isAdmin && tasteCd > 0) ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : insightPickMode === 'taste' ? 'bg-rose-700 border-rose-800 text-white shadow-lg ring-2 ring-rose-300' : 'bg-gradient-to-br from-rose-500 to-rose-700 border-rose-700 text-white shadow-md active:scale-95'}`}
          >
            <div className="text-lg mb-0.5">🍷</div>
            <div className="font-black text-sm">내 취향 총평</div>
            <div className={`text-[10px] mt-0.5 font-bold ${insightLoading !== '' || noNotes || (!isAdmin && tasteCd > 0) ? 'text-gray-400' : 'text-rose-100'}`}>
              {insightLoading === 'taste' ? '분석 중...' : (!isAdmin && tasteCd > 0) ? `${tasteCd}일 후 가능` : insightPickMode === 'taste' ? '주종을 골라주세요 ↓' : '지금까지의 취향 해석'}
            </div>
          </button>

          <button
            onClick={() => setInsightPickMode(insightPickMode === 'recommend' ? '' : 'recommend')}
            disabled={insightLoading !== '' || noNotes || (!isAdmin && recCd > 0)}
            className={`p-4 rounded-2xl border text-left transition-all ${insightLoading !== '' || noNotes || (!isAdmin && recCd > 0) ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : insightPickMode === 'recommend' ? 'bg-purple-700 border-purple-800 text-white shadow-lg ring-2 ring-purple-300' : 'bg-gradient-to-br from-indigo-500 to-purple-700 border-purple-700 text-white shadow-md active:scale-95'}`}
          >
            <div className="text-lg mb-0.5">🧭</div>
            <div className="font-black text-sm">취향 밖 추천</div>
            <div className={`text-[10px] mt-0.5 font-bold ${insightLoading !== '' || noNotes || (!isAdmin && recCd > 0) ? 'text-gray-400' : 'text-indigo-100'}`}>
              {insightLoading === 'recommend' ? '분석 중...' : (!isAdmin && recCd > 0) ? `${recCd}일 후 가능` : insightPickMode === 'recommend' ? '주종을 골라주세요 ↓' : '안 마셔본 다른 스타일'}
            </div>
          </button>
        </div>

        {/* 주종 선택 패널 */}
        {insightPickMode !== '' && insightLoading === '' && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-dashed border-gray-200 animate-in fade-in slide-in-from-top-1">
            <p className="text-xs font-black text-gray-700 mb-2.5">
              {insightPickMode === 'recommend' ? '🧭 어떤 주종에서 새 스타일을 추천받을까요?' : '🍷 어떤 주종의 취향을 분석할까요?'}
            </p>
            <div className="flex flex-wrap gap-2">
              {sortedTypes.map(([type, count]) => {
                const conf = LIQUOR_CONFIG[type] || { name: type, icon: '🍸' };
                return (
                  <button
                    key={type}
                    onClick={() => runInsight(insightPickMode, type)}
                    className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-900 hover:text-white border border-gray-200 px-3 py-2 rounded-xl text-xs font-black text-gray-700 transition-all active:scale-95"
                  >
                    <span>{conf.icon || '🍸'}</span>
                    <span>{conf.name}</span>
                    <span className="opacity-60 font-mono">{count}병</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {noNotes && (
          <p className="text-center text-xs text-gray-400 font-medium py-2">먼저 시음 노트를 남기면 분석을 받을 수 있어요!</p>
        )}

        {/* 로딩 */}
        {insightLoading !== '' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
            <div className="inline-block w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
            <p className="text-sm text-gray-500 font-bold">AI가 당신의 취향을 분석하고 있어요...</p>
          </div>
        )}

        {/* 결과 */}
        {insightResult && insightLoading === '' && (
          <div className={`bg-white p-5 rounded-2xl shadow-sm border-2 ${insightResult.mode === 'recommend' ? 'border-indigo-200' : 'border-rose-200'} animate-in fade-in slide-in-from-bottom-2`}>
            <div className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full mb-2 ${insightResult.mode === 'recommend' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
              {insightResult.mode === 'recommend' ? '🧭 취향 밖 추천' : '🍷 내 취향 총평'}{insightResult.liquorName ? ` · ${insightResult.liquorName}` : ''}
            </div>
            <h3 className="text-lg font-black text-gray-900 mb-1.5">{insightResult.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed font-medium mb-3">{insightResult.body}</p>
            <div className="space-y-2">
              {(insightResult.items || []).map((it, i) => (
                <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <span className={`inline-block font-black text-xs px-2 py-1 rounded-lg mb-1.5 ${insightResult.mode === 'recommend' ? 'bg-indigo-600 text-white' : 'bg-rose-700 text-white'}`}>{it.label}</span>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">{it.desc}</p>
                </div>
              ))}
            </div>

            {/* 가격대별 추천 와인 */}
            {Array.isArray(insightResult.recommendations) && insightResult.recommendations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-black text-gray-700 mb-2.5">💰 가격대별 추천 {insightResult.liquorName || ''}</p>
                <div className="flex gap-2 mb-3">
                  {[['low', '1~10만'], ['mid', '10~30만'], ['high', '30만+']].map(([tier, label]) => {
                    const count = insightResult.recommendations.filter(r => r.tier === tier).length;
                    const active = insightTier === tier;
                    return (
                      <button
                        key={tier}
                        onClick={() => setInsightTier(tier)}
                        className={`flex-1 py-2 rounded-xl text-[11px] font-black border transition-all ${active ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-500 border-gray-200'}`}
                      >
                        {label}<span className="opacity-60 ml-1 font-mono">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {insightResult.recommendations.filter(r => r.tier === insightTier).length === 0 ? (
                    <p className="text-center text-[11px] text-gray-400 font-medium py-3 bg-gray-50 rounded-xl">이 가격대는 마땅한 추천이 없어요</p>
                  ) : (
                    insightResult.recommendations.filter(r => r.tier === insightTier).map((r, i) => (
                      <div key={i} className="bg-amber-50/60 border border-amber-100 p-3 rounded-xl">
                        <p className="text-sm font-black text-gray-800">🍾 {r.name}</p>
                        <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-0.5">{r.note}</p>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-[9px] text-gray-300 font-medium mt-2 text-center">AI 추천이라 실제 가격·정보는 다를 수 있어요</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderListView = () => {

    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm space-y-3.5">
          {/* 상단 헤더 및 가격 정렬 선택 휠 */}
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-black text-gray-800">내 테이스팅 노트 ({processedNotes.length}개)</h2>
            <select
              value={listSortKey}
              onChange={(e) => setListSortKey(e.target.value)}
              className="text-[11px] font-black bg-gray-50 border border-gray-200 rounded-lg p-1.5 outline-none text-gray-700 cursor-pointer shadow-xs"
            >
              <option value="latest">📅 최신 등록순</option>
              <option value="ratingDesc">⭐ 평점 높은순</option>
              <option value="priceDesc">💵 가격 높은순</option>
            </select>
          </div>

          <div className="border-t border-gray-100 my-1"></div>

          {/* 🍇 와인 종류별 상세 필터 랙 */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black text-gray-400 block pl-0.5">와인 종류 필터</span>
            <div className="flex gap-1 overflow-x-auto hide-scrollbar">
              {[
                { id: 'all', name: '전체' },
                { id: 'red', name: '🍷 레드' },
                { id: 'white', name: '🥂 화이트' },
                { id: 'champagne', name: '🍾 샴페인' },
                { id: 'desert', name: '🍯 디저트' }
              ].map(style => (
                <button
                  key={style.id} type="button"
                  onClick={() => setFilterStyle(style.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap border transition-all ${filterStyle === style.id ? 'bg-rose-900 text-white border-rose-950 shadow-xs' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>

          {/* 🗺️ 지역별 상세 필터 휠 매핑 구역 */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black text-gray-400 block pl-0.5">생산 지역 필터</span>
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none text-gray-800 cursor-pointer"
            >
              <option value="all">🗺️ 모든 생산 지역 (전체 보기)</option>
              {uniqueRegions.filter(r => r !== 'all').map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
        </div>

        {processedNotes.length === 0 && (
          <div className="text-center p-12 bg-white rounded-2xl border border-dashed text-gray-400 text-xs font-bold">
            선택한 필터 조건에 맞는 와인 노트가 없습니다.
          </div>
        )}
        {processedNotes.map(note => {
          const conf = LIQUOR_CONFIG[note.liquorType] || LIQUOR_CONFIG.wine;
          const theme = getThemeClasses(conf.theme);
          return (
            <div key={note.id} onClick={() => { setSelectedDetailNote(note); setIsCommunityModal(false); }} className="bg-white p-4 rounded-xl shadow-sm border flex gap-4 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99]">
              {note.thumbnail && <img src={note.thumbnail} className="w-20 h-20 bg-gray-100 rounded-lg object-cover" />}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${theme.bg} ${theme.text}`}>
                      {note.analysisResult?.wineStyle === 'white' ? '🥂 화이트' : note.analysisResult?.wineStyle === 'champagne' ? '🍾 샴페인' : note.analysisResult?.wineStyle === 'desert' ? '🍯 디저트' : '🍷 레드'}
                    </span>
                    {note.analysisResult?.vintage && note.analysisResult.vintage !== 'null' && (
                      <span className="text-[9px] font-mono font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {note.analysisResult.vintage}
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-sm text-gray-900 truncate leading-tight">{note.analysisResult?.name}</h3>
                  {note.personalNotes && (
                    <p className="text-xs text-gray-500 font-medium mt-1.5 line-clamp-2 bg-gray-50 p-2 rounded-lg border border-gray-100 italic">
                      "{note.personalNotes}"
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs mt-2 pt-1.5 border-t border-gray-50">
                  <span className="text-rose-700 font-black font-mono">★ {note.overallRating || 50}점</span>
                  {note.price ? <span className="text-gray-400 font-bold text-[10px]">₩{Number(note.price).toLocaleString()}</span> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCommunityView = () => {
    let displayedPosts = [...communityPosts];
    if (communitySort === 'latest') displayedPosts.sort((a, b) => b.createdAt - a.createdAt);
    else if (communitySort === 'best') displayedPosts.sort((a, b) => (b.totalCommunityScore || 0) - (a.totalCommunityScore || 0));

    return (
      <div className="space-y-4 animate-in fade-in duration-300">

        <div className="bg-gradient-to-r from-gray-900 via-slate-900 to-black rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none transform rotate-12">
            <Icon name="Users" className="w-40 h-40" />
          </div>
          <div className="relative z-10">
            <h2 className="text-lg font-black flex items-center mb-1.5">
              <Icon name="Users" className="w-5 h-5 mr-2 text-indigo-400" /> 커뮤니티 스퀘어
            </h2>
            <div onClick={() => setShowRankModal(true)} className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm">
              내 칭호: <span className="text-yellow-400 font-black">{userStats[user?.uid]?.badge || '🥚 알콜 입문자'}</span> 🔍
            </div>
          </div>
        </div>

        {/* 🎛️ 하이엔드 서브 슬라이딩 탭바 */}
        <div className="flex bg-gray-200/70 p-1 rounded-xl border border-gray-300/30">
          <button
            onClick={() => setSubTab('lounge')}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${subTab === 'lounge' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            💬 보틀 라운지 <span className="text-[10px] font-medium opacity-60">({displayedPosts.length})</span>
          </button>
          <button
            onClick={() => setSubTab('ranking')}
            className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${subTab === 'ranking' ? 'bg-white text-indigo-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            👑 명예 보틀 랭킹
          </button>
        </div>

        {subTab === 'lounge' && (
          <div className="flex justify-between items-center bg-white p-2 rounded-xl shadow-sm border border-gray-100 gap-2">
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar snap-x flex-1">
              <button onClick={() => setCommunityFilter('all')} className={`snap-start px-3 py-1 rounded-full text-xs font-black ${communityFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-500 border hover:bg-gray-100'}`}>전체</button>
              {Object.values(LIQUOR_CONFIG).map(l => (
                <button key={l.id} onClick={() => setCommunityFilter(l.id)} className={`snap-start px-3 py-1 rounded-full text-xs font-black whitespace-nowrap ${communityFilter === l.id ? `${getThemeClasses(l.theme).btnBg} text-white` : 'bg-gray-50 text-gray-500 border hover:bg-gray-100'}`}>{l.icon} {l.name}</button>
              ))}
            </div>
            <select onChange={(e) => setCommunitySort(e.target.value)} value={communitySort} className="text-[10px] font-black bg-gray-50 border border-gray-200 rounded-lg p-1.5 outline-none cursor-pointer text-gray-700 shrink-0">
              <option value="latest">최신순</option>
              <option value="best">베스트</option>
            </select>
          </div>
        )}

        {subTab === 'lounge' && (
          <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-300">
            {displayedPosts.filter(p => communityFilter === 'all' || p.liquorType === communityFilter).map(post => {
              const conf = LIQUOR_CONFIG[post.liquorType] || LIQUOR_CONFIG.wine;
              const avgScore = post.ratings && Object.keys(post.ratings).length > 0 ? (Object.values(post.ratings).reduce((a, b) => a + b, 0) / Object.keys(post.ratings).length) : 0;

              return (
                <div key={post.id} onClick={() => { setSelectedDetailNote(post); setIsCommunityModal(true); setOpenComments(p => ({ ...p, [post.id]: true })); }} className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-sm flex flex-col hover:shadow-md transition-all active:scale-[0.98] cursor-pointer group relative">

                  <div className="aspect-square bg-gray-50 relative overflow-hidden border-b border-gray-100 shrink-0">
                    {post.thumbnail ? (
                      <img src={post.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="Bottle" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl bg-slate-50">{conf.icon}</div>
                    )}

                    <span className={`absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm z-10 ${getThemeClasses(conf.theme).bg} ${getThemeClasses(conf.theme).text}`}>
                      {post.analysisResult?.type || conf.name}
                    </span>

                    {post.isVerified && (
                      <span className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-0.5 shadow">
                        <Icon name="Check" className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 flex-1 flex flex-col justify-between space-y-1.5">
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 text-xs truncate leading-tight group-hover:text-indigo-600">{post.analysisResult?.name || '이름 없음'}</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-0.5 truncate">by {post.userId === user?.uid ? userProfile.nickname : (post.userName || '보틀러')}</p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-gray-50 flex-wrap gap-1">
                      <span className="text-amber-500 font-black flex items-center">
                        ★ {avgScore > 0 ? avgScore.toFixed(1) : "0.0"}
                      </span>
                      <span className="text-gray-400 font-medium">💬 {post.comments?.length || 0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {displayedPosts.filter(p => communityFilter === 'all' || p.liquorType === communityFilter).length === 0 && (
              <div className="col-span-2 text-center py-12 bg-white rounded-2xl border text-gray-400 font-medium text-xs">선택한 카테고리에 등록된 보틀이 없습니다.</div>
            )}
          </div>
        )}

        {subTab === 'ranking' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {[...communityPosts]
              .sort((a, b) => (b.totalCommunityScore || 0) - (a.totalCommunityScore || 0))
              .map((post, index) => {
                const rankingAuthorStats = userStats[post.userId] || { badge: '🥚 알콜 입문자', isTop: false, rank: '-' };
                const myRating = post.ratings?.[user?.uid] || 0;
                const isAuthor = post.userId === user?.uid; // 🐛 작성자 본인 여부
                const conf = LIQUOR_CONFIG[post.liquorType] || LIQUOR_CONFIG.wine;
                const hasCommented = post.comments?.some(c => c.userId === user?.uid);
                const isRatingLocked = myRating > 0 && hasCommented;

                return (
                  <div key={post.id} className="bg-white rounded-3xl shadow-sm border border-gray-200/90 overflow-hidden relative">

                    <div className="p-3.5 flex items-center justify-between border-b border-gray-100 bg-slate-50/50">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black px-2.5 py-0.5 rounded-xl text-white shadow-sm flex items-center gap-0.5 ${index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-700' : 'bg-gray-800'}`}>
                          {index === 0 ? '🥇 1위' : index === 1 ? '🥈 2위' : index === 2 ? '🥉 3위' : `${index + 1}위`}
                        </span>
                        <div className="flex items-center gap-1.5 max-w-[150px] truncate">
                          <span className="text-base mr-0.5">
                            {rankingAuthorStats.isTop ? '🏆' : (rankingAuthorStats.badge ? rankingAuthorStats.badge.split(' ')[0] : '🥚')}
                          </span>
                          <span className="font-black text-xs text-gray-800">{post.userId === user?.uid ? userProfile.nickname : (post.userName || '지나간 보틀러')}</span>
                          <span className="text-[9px] text-gray-400 font-medium shrink-0">{formatTimeAgo(post.createdAt)}</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {post.verificationStatus === 'ai_verified' && <span className="flex items-center bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-emerald-100"><Icon name="Check" className="w-3 h-3 mr-1" /> AI인증</span>}
                        {post.verificationStatus === 'community_verified' && <span className="flex items-center bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-blue-100"><Icon name="Users" className="w-3 h-3 mr-1" /> 집단인증</span>}
                        {post.verificationStatus === 'pending_vote' && <span className="flex items-center bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-amber-100 animate-pulse"><Icon name="Search" className="w-3 h-3 mr-1" /> 인증투표중</span>}
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="flex gap-4">
                        {post.thumbnail && (
                          <div className="w-24 h-24 bg-gray-50 rounded-2xl border flex-shrink-0 relative overflow-hidden shadow-inner cursor-pointer" onClick={() => setSelectedImage(post.thumbnail)}>
                            <img src={post.thumbnail} className="w-full h-full object-cover" alt="Rank Bottle" />
                            <div className="absolute top-1 left-1 bg-black/50 text-white rounded w-5 h-5 flex items-center justify-center text-xs">{conf.icon}</div>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={`text-[9px] font-black px-2 py-0.5 rounded mb-1 inline-block uppercase ${getThemeClasses(conf.theme).bg} ${getThemeClasses(conf.theme).text}`}>{post.analysisResult?.type || conf.name}</div>
                          <h3 onClick={() => { setSelectedDetailNote(post); setIsCommunityModal(true); }} className="font-black text-gray-900 leading-tight mb-1 hover:text-indigo-600 hover:underline cursor-pointer flex items-center gap-1 text-base">{post.analysisResult?.name || '이름 없음'} 📋</h3>

                          <div className="flex flex-col gap-1 mt-2 w-full">
                            <div className="flex justify-between items-center text-[11px] font-black text-indigo-950">
                              <span className="flex items-center gap-0.5"><Icon name="Star" className="w-3.5 h-3.5 fill-current text-amber-500" /> 누적 부러움 총점</span>
                              <span className="bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-indigo-700 font-mono">{post.totalCommunityScore ? post.totalCommunityScore.toFixed(1) : "0.0"} 점</span>
                            </div>
                            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden border border-gray-200/40 shadow-inner">
                              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, ((post.totalCommunityScore || 0) / Math.max(1, (communityPosts[0]?.totalCommunityScore || 100))) * 100)}%` }}></div>
                            </div>
                            <p className="text-[9px] text-gray-400 font-bold text-right">참여: {Object.keys(post.ratings || {}).length}명 / 평점: {post.ratings && Object.keys(post.ratings).length > 0 ? (Object.values(post.ratings).reduce((a, b) => a + b, 0) / Object.keys(post.ratings).length).toFixed(1) : "0.0"}점</p>
                          </div>
                        </div>
                      </div>

                      {post.personalNotes && (
                        <div className="text-sm text-gray-700 bg-gray-50/70 p-3.5 rounded-xl border border-gray-100 font-medium leading-relaxed italic">"{post.personalNotes}"</div>
                      )}
                    </div>

                    {post.verificationStatus === 'pending_vote' &&
                      user && !user.isAnonymous &&
                      (user.providerData && user.providerData.length > 0) &&
                      post.votes?.voters?.[user?.uid] === undefined && (
                        <div className="mx-4 mb-4 p-4 bg-amber-50/60 border border-amber-200/50 rounded-2xl text-left">
                          <div className="flex items-start gap-2.5">
                            <Icon name="Info" className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="text-xs font-black text-amber-950 mb-1">🙋‍♂️ 이 보틀, 직접 수기로 마신 인증인가요?</h4>
                              <p className="text-[11px] text-amber-900 leading-relaxed mb-3">
                                AI가 사진에서 코드를 찾지 못했습니다. 사진 확대 시 쪽지에 적힌 <b className="bg-white px-1.5 py-0.5 rounded border border-amber-300 font-mono text-[11px]">{post.verificationCodeUsed}</b> 코드가 보이신다면 투표해 주세요!
                              </p>
                              <div className="flex gap-2">
                                <button onClick={() => handleVoteVerification(post.id, 'yes')} className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all bg-white hover:bg-emerald-50 text-emerald-700 border border-gray-200 shadow-sm active:scale-95">👍 보인다! ({post.votes?.yesCount || 0})</button>
                                <button onClick={() => handleVoteVerification(post.id, 'no')} className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all bg-white hover:bg-rose-50 text-rose-600 border border-gray-200 shadow-sm active:scale-95">👎 안 보인다 ({post.votes?.noCount || 0})</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                    <div className="border-t border-gray-100 bg-gray-50/70 p-4 space-y-3.5">
                      <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-200/60 shadow-sm gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black text-gray-500 tracking-tight">부러움 점수 평가</p>
                          <p className="text-[9px] text-indigo-500 font-bold truncate">댓글 작성 시 점수 자동 고정!</p>
                        </div>
                        {isAuthor ? (
                          <div className="bg-gray-50 border border-gray-200 text-gray-500 font-black text-[11px] px-2.5 py-1.5 rounded-xl shadow-sm whitespace-nowrap">🍷 내 보틀</div>
                        ) : isRatingLocked ? (
                          <div className="bg-amber-50 border border-amber-200 text-amber-800 font-black text-[11px] px-2.5 py-1.5 rounded-xl shadow-sm whitespace-nowrap">🔒 평가 완료 ({myRating.toFixed(1)}점)</div>
                        ) : (
                          <div className="shrink-0" onTouchMove={(e) => { if (!e.touches[0]) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.touches[0].clientX - rect.left; const percent = Math.min(Math.max(x / rect.width, 0), 1); const calculated = Math.round(percent * 5 * 2) / 2; setPendingRatings(p => ({ ...p, [post.id]: calculated })); }}>
                            <FractionalStarRating value={pendingRatings[post.id] ?? myRating} onChange={(score) => setPendingRatings(p => ({ ...p, [post.id]: score }))} />
                          </div>
                        )}
                      </div>

                      <button onClick={() => setOpenComments(p => ({ ...p, [post.id]: !p[post.id] }))} className="w-full flex items-center justify-between py-2 text-xs font-black text-gray-500 hover:text-indigo-600 transition-colors bg-white px-3 rounded-xl border border-gray-200/60 shadow-sm">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">💬 댓글 {(post.comments || []).length}개 {openComments[post.id] ? '접기' : '모두 보기'}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{openComments[post.id] ? '▲' : '▼'}</span>
                      </button>

                      <div className={`transition-all duration-300 ${openComments[post.id] ? 'block animate-in fade-in slide-in-from-top-1' : 'hidden'}`}>
                        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                          {(post.comments || []).map(c => {
                            const commenterRating = post.ratings?.[c.userId] || 0;
                            const commenterStats = userStats[c.userId] || { badge: '🥚 알콜 입문자' };

                            return (
                              <div key={c.id} className="space-y-1.5 border-b border-gray-100/50 pb-2 last:border-0">
                                {/* 댓글 본체 */}
                                <div className="text-xs bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs shrink-0">{commenterStats.badge ? commenterStats.badge.split(' ')[0] : '🥚'}</span>
                                    <span className="font-extrabold text-gray-800">{c.userName || '알콜러'}</span>
                                    {commenterRating > 0 && <span className="text-[10px] text-amber-500 font-black shrink-0 ml-0.5">★ {commenterRating.toFixed(1)}</span>}
                                    <span className="text-[9px] text-gray-400 font-medium ml-auto shrink-0">{formatTimeAgo(c.createdAt)}</span>
                                  </div>
                                  <p className="text-gray-600 font-medium mt-1 pl-0.5">{c.text}</p>
                                  <div className="text-right">
                                    <button onClick={() => setActiveReplyBox(activeReplyBox === c.id ? null : c.id)} className="text-[10px] font-bold text-indigo-600 hover:underline mt-1">
                                      {activeReplyBox === c.id ? '취소' : '↳ 답글 달기'}
                                    </button>
                                  </div>
                                </div>

                                {/* 대댓글 목록 */}
                                {(c.replies || []).map(r => {
                                  const replyStats = userStats[r.userId] || { badge: '🥚 알콜 입문자' };
                                  return (
                                    <div key={r.id} className="ml-5 text-xs bg-gray-50/80 p-2 rounded-xl border border-dashed border-gray-200 space-y-1 flex gap-1.5 items-start">
                                      <span className="text-gray-400 text-[11px] mt-0.5 shrink-0">↳</span>
                                      <div className="flex-1 space-y-0.5">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <span className="text-[10px] shrink-0">{replyStats.badge ? replyStats.badge.split(' ')[0] : '🥚'}</span>
                                          <span className="font-bold text-gray-700">{r.userName || '알콜러'}</span>
                                          <span className="text-[8px] text-gray-400 font-medium ml-auto shrink-0">{formatTimeAgo(r.createdAt)}</span>
                                        </div>
                                        <p className="text-gray-600 font-medium pl-0.5">{r.text}</p>
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* 대댓글 입력창 */}
                                {activeReplyBox === c.id && (
                                  <div className="ml-5 flex gap-1.5 pt-1 animate-in slide-in-from-top-2 duration-200">
                                    <input type="text" placeholder="답글 내용을 입력하세요..." value={replyInputs[c.id] || ''} onChange={(e) => setReplyInputs(p => ({ ...p, [c.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleAddReply(post.id, c.id)} className="flex-1 border rounded-xl px-2.5 py-1.5 bg-white text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" />
                                    <button onClick={() => handleAddReply(post.id, c.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shrink-0 shadow-sm">등록</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1 border-t border-gray-200/50">
                        <input type="text" placeholder="댓글을 남기고 점수를 고정하세요!" value={commentInputs[post.id] || ''} onChange={(e) => setCommentInputs(p => ({ ...p, [post.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)} className="flex-1 border rounded-xl px-3 py-2 bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" />
                        <button onClick={() => handleAddComment(post.id)} className="bg-gray-800 hover:bg-black text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 shadow-md"><Icon name="Send" className="w-3 h-3 ml-0.5" /></button>
                      </div>
                    </div>

                  </div>
                );
              })}
          </div>
        )}

      </div>
    );
  };

  const renderSearchView = () => {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl p-6 text-white shadow-md">
          <h2 className="text-xl font-bold flex items-center mb-2">
            <Icon name="Search" className="w-6 h-6 mr-2 text-blue-300" /> 보틀 백과 & 시세 검색
          </h2>
          <p className="text-sm text-indigo-100 opacity-90 leading-relaxed">
            궁금한 보틀 이름을 검색해보세요.<br />AI가 최신 웹 검색을 통해 역사, 테이스팅 노트, 그리고 최근 시세(성지 가격)를 간략히 요약해 드립니다.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-white p-2 rounded-2xl shadow-sm border border-gray-200">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearchLiquor()}
            placeholder="예: 조니워커 블루라벨, 맥캘란 12년 쉐리"
            className="flex-1 bg-transparent px-3 py-2 outline-none text-gray-800 placeholder-gray-400"
          />
          <button
            onClick={handleSearchLiquor}
            disabled={isSearching || !searchQuery.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {isSearching ? <Icon name="Loader2" className="w-5 h-5 animate-spin" /> : <Icon name="Search" className="w-5 h-5" />}
          </button>
        </div>

        {/* 📷 사진으로 검색 */}
        <input type="file" accept="image/*" ref={searchFileInputRef} onChange={handleSearchPhotoUpload} className="hidden" />
        <button
          onClick={triggerSearchPhoto}
          disabled={isSearching}
          className="w-full flex items-center justify-center gap-2 bg-white border border-indigo-200 text-indigo-700 font-black text-sm py-3 rounded-2xl shadow-sm hover:bg-indigo-50 transition-colors disabled:opacity-50"
        >
          <Icon name="Camera" className="w-5 h-5" /> 사진으로 검색하기
        </button>
        <p className="text-[11px] text-gray-400 font-medium text-center -mt-1">라벨 사진을 올리면 이름을 읽어 검색해드려요.</p>

        {searchResult && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-4">
            <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-black text-lg text-gray-900">{searchResult.name}</h3>
              <div className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-1 rounded">AI 요약</div>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <h4 className="flex items-center text-sm font-bold text-gray-800 mb-1.5"><Icon name="BookOpen" className="w-4 h-4 mr-1.5 text-gray-500" /> 역사 및 특징</h4>
                <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl">{searchResult.summary}</p>
              </div>

              <div>
                <h4 className="flex items-center text-sm font-bold text-gray-800 mb-1.5"><Icon name="Wine" className="w-4 h-4 mr-1.5 text-rose-500" /> 테이스팅 노트</h4>
                <p className="text-sm text-gray-600 leading-relaxed bg-rose-50/50 p-3 rounded-xl border border-rose-100">{searchResult.tasting}</p>
              </div>

              <div className="grid gap-3 pt-2">
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                  <h4 className="flex items-center text-xs font-bold text-blue-800 mb-1"><Icon name="DollarSign" className="w-4 h-4 mr-1" /> 시중 평균 시세</h4>
                  <p className="text-sm font-medium text-gray-800">{searchResult.avgPrice}</p>
                </div>

                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl">
                  <h4 className="flex items-center text-xs font-bold text-amber-800 mb-1"><Icon name="MapPin" className="w-4 h-4 mr-1" /> 최근 성지/할인 정보</h4>
                  <p className="text-sm font-medium text-gray-800">{searchResult.bargainInfo}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-10">
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      {toast.show && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full text-sm font-medium shadow-xl">{toast.message}</div>
      )}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => setIsMenuOpen(true)} className="p-2 -ml-2 text-gray-600 hover:text-black transition-colors"><Icon name="Menu" className="w-6 h-6" /></button>
            <h1 className="text-lg font-black ml-2 tracking-tight">TastingNote</h1>
          </div>

          <div className="flex items-center space-x-2">
            {user && !user.isAnonymous ? (
              <button onClick={() => { setNicknameInput(userProfile.nickname); setShowNicknameModal(true); }} className="text-xs font-black bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100 max-w-[100px] truncate hover:bg-indigo-100 transition-colors">👤 {userProfile.nickname} ✏️</button>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="text-xs font-bold text-gray-600 hover:text-black bg-gray-50 border border-gray-200 hover:bg-gray-100 px-2.5 py-1.5 rounded-full transition-all"
              >
                로그인
              </button>
            )}

            <button onClick={() => navigateTo('add')} className="text-sm font-bold bg-gray-900 hover:bg-black text-white px-3 py-1.5 rounded-full flex items-center shadow-sm transition-colors">
              <Icon name="PlusCircle" className="w-4 h-4 mr-1" /> 새 리뷰
            </button>
          </div>
        </div>
      </header>

      <div className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMenuOpen(false)}>
        <div className={`absolute top-0 left-0 w-64 h-full bg-white shadow-2xl transition-transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="font-black text-lg">메뉴</h2>
            <button onClick={() => setIsMenuOpen(false)}><Icon name="X" className="w-5 h-5 text-gray-500" /></button>
          </div>
          <nav className="p-3 space-y-1">
            <button onClick={() => navigateTo('add')} className={`w-full flex items-center px-4 py-3 rounded-xl font-medium ${currentView === 'add' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}><Icon name="PlusCircle" className="w-5 h-5 mr-3" /> 새 노트 작성</button>
            <button onClick={() => navigateTo('list')} className={`w-full flex items-center px-4 py-3 rounded-xl font-medium ${currentView === 'list' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}><Icon name="List" className="w-5 h-5 mr-3" /> 내 테이스팅 노트</button>
            <button onClick={() => navigateTo('insights')} className={`w-full flex items-center px-4 py-3 rounded-xl font-medium ${currentView === 'insights' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}><Icon name="BarChart3" className="w-5 h-5 mr-3" /> 나의 취향 분석</button>
            <div className="my-2 border-t border-gray-100"></div>
            <button onClick={() => navigateTo('search')} className={`w-full flex items-center px-4 py-3 rounded-xl font-medium ${currentView === 'search' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-600 hover:bg-blue-50'}`}><Icon name="Search" className="w-5 h-5 mr-3" /> 보틀 백과 & 시세 검색</button>
            <button onClick={() => navigateTo('community')} className={`w-full flex items-center px-4 py-3 rounded-xl font-medium mt-1 ${currentView === 'community' ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-600 hover:bg-indigo-50'}`}><Icon name="Users" className="w-5 h-5 mr-3" /> 보틀 라운지</button>
          </nav>
        </div>
      </div>

      <main className="max-w-md mx-auto p-4 mt-2">
        {currentView === 'add' && renderAddView()}
        {currentView === 'list' && renderListView()}
        {currentView === 'insights' && renderInsightsView()}
        {currentView === 'search' && renderSearchView()}
        {currentView === 'community' && renderCommunityView()}
      </main>

      {showNicknameModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowNicknameModal(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm border shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <h3 className="font-black text-base text-gray-900">👤 내 계정 프로필 관리</h3>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-2 py-0.5 rounded-full">
                {(user && !user.isAnonymous) || (user?.providerData && user.providerData.length > 0) ? "구글 연동 회원" : "익명 비회원"}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-black text-gray-400 pl-0.5">닉네임 변경</label>
              <input
                type="text"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
                placeholder="변경할 닉네임을 입력하세요"
                className="w-full border rounded-xl px-4 py-3 bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold shadow-inner"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowNicknameModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-xl text-xs transition-colors">닫기</button>
              <button onClick={handleUpdateNickname} className="flex-1 bg-gray-900 hover:bg-black text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors">닉네임 저장</button>
            </div>

            {((user && !user.isAnonymous) || (user?.providerData && user.providerData.length > 0)) && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={handleLogout}
                  className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-black py-2.5 rounded-xl text-xs border border-rose-200/60 transition-all flex items-center justify-center gap-1 active:scale-95"
                >
                  👋 앱에서 로그아웃하기 (익명 전환)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 저장 시 라운지 공유 여부 확인 팝업 */}
      {showShareConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-5 animate-in fade-in duration-200" onClick={() => setShowShareConfirm(false)}>
          <div className="bg-white rounded-3xl w-full max-w-xs p-6 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-2">🍷</div>
            <h3 className="text-lg font-black text-gray-900 mb-1">라운지에도 공유할까요?</h3>
            <p className="text-xs text-gray-500 font-medium mb-5 leading-relaxed">공유하면 보틀 라운지에서 다른 사람들이<br />보고 평점을 줄 수 있어요.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleSaveNote(true)}
                disabled={isSaving}
                className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSaving && <Icon name="Loader2" className="animate-spin w-4 h-4" />}
                라운지에 공유하기
              </button>
              <button
                onClick={() => handleSaveNote(false)}
                disabled={isSaving}
                className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-sm active:scale-95 transition-all disabled:opacity-60"
              >
                나만 보기 (저장만)
              </button>
            </div>
          </div>
        </div>
      )}

      {showRankModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowRankModal(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm max-h-[75vh] overflow-y-auto border shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-black text-lg text-gray-900">👑 명예 칭호 획득 기준</h3>
              <button onClick={() => setShowRankModal(false)} className="p-1 bg-gray-100 rounded-full text-xs font-bold px-2">닫기</button>
            </div>
            <p className="text-xs text-gray-400 border-b pb-2">라운지에 공유한 보틀들이 획득한 '누적 부러움 총점'에 따라 계급이 실시간으로 결정됩니다.</p>
            <div className="space-y-1.5 text-sm">
              {[
                { s: '2000점 이상', n: '🐉 10. 주신(酒神)' },
                { s: '1000점 이상', n: '🌌 9. 술의 요정' },
                { s: '500점 이상', n: '👑 8. 주류계의 대부' },
                { s: '300점 이상', n: '🥃 7. 캐스크 마스터' },
                { s: '150점 이상', n: '🍷 6. 소믈리에' },
                { s: '100점 이상', n: '🍸 5. 바텐더' },
                { s: '60점 이상', n: '🍶 4. 미식가' },
                { s: '30점 이상', n: '🍺 3. 동네 술꾼' },
                { s: '10점 이상', n: '🍼 2. 혼술러' },
                { s: '0점 이상', n: '🥚 1. 알콜 입문자' }
              ].map(r => (
                <div key={r.n} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 font-medium">
                  <span className="text-gray-800">{r.n}</span>
                  <span className="text-indigo-600 font-bold text-xs bg-indigo-50 px-2 py-0.5 rounded-full">{r.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedDetailNote && !isCommunityModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedDetailNote(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto space-y-5 border shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] bg-rose-50 text-rose-800 font-bold px-2 py-0.5 rounded uppercase border border-rose-100">
                  {selectedDetailNote.analysisResult?.wineStyle === 'white' ? '🥂 화이트 와인' : selectedDetailNote.analysisResult?.wineStyle === 'champagne' ? '🍾 샴페인/스파클링' : selectedDetailNote.analysisResult?.wineStyle === 'desert' ? '🍯 디저트 와인' : '🍷 레드 와인'}
                </span>
                <h3 className="font-black text-xl text-gray-900 mt-1 leading-tight">{selectedDetailNote.analysisResult?.name}</h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => handleDeleteMyNote(selectedDetailNote)} className="p-1.5 bg-red-50 hover:bg-red-100 rounded-full transition-colors" title="노트 삭제"><Icon name="Trash" className="w-5 h-5 text-red-500" /></button>
                <button onClick={() => setSelectedDetailNote(null)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><Icon name="X" className="w-5 h-5 text-gray-500" /></button>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">📊 맛의 균형 (Palate) 기록</h4>
              {selectedDetailNote.originalRatings || selectedDetailNote.ratings ? Object.entries(selectedDetailNote.originalRatings || selectedDetailNote.ratings).map(([key, val]) => {
                if (typeof val === 'object' || !['sweetness', 'acidity', 'tannin', 'body', 'mousse', 'finish', 'balance'].includes(key)) return null;
                return (
                  <div key={key} className="flex justify-between text-xs font-bold py-1.5 border-b border-gray-200/50 last:border-0">
                    <span className="text-gray-600">{key === 'sweetness' ? '당도' : key === 'acidity' ? '산미' : key === 'tannin' ? '타닌' : key === 'body' ? '바디감' : key === 'mousse' ? '기포감' : key === 'finish' ? '여운' : key === 'balance' ? '균형감' : key.toUpperCase()}</span>
                    <span className="text-rose-800 bg-white px-2 py-0.5 rounded border shadow-inner">★ {val} / 5</span>
                  </div>
                );
              }) : <p className="text-xs text-gray-400 text-center py-2">기록된 세부 지표가 없습니다.</p>}
            </div>

            {selectedDetailNote.selectedAromas && selectedDetailNote.selectedAromas.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">🌿 감지된 아로마 & 부케 노트</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDetailNote.selectedAromas.map(aroma => (
                    <span key={aroma} className="bg-emerald-50 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full border border-emerald-100"># {aroma}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 오늘의 한줄평 상시 노출 구역 */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100 space-y-1.5">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">✍️ 내가 남긴 오늘의 한줄평</h4>
              <p className="text-sm text-gray-700 font-medium leading-relaxed italic">
                {selectedDetailNote.personalNotes ? `"${selectedDetailNote.personalNotes}"` : "작성된 한줄평이 없습니다."}
              </p>
            </div>

            {/* 🍷 라운지 게시 / 게시 취소 (게시 상태에 따라 전환) */}
            {selectedDetailNote.communityPostId ? (
              <button
                type="button"
                onClick={() => handleUnpublishFromLounge(selectedDetailNote)}
                className="w-full bg-white border-2 border-rose-200 text-rose-700 font-black py-3.5 rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 hover:bg-rose-50"
              >
                🚫 라운지 게시 취소
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePublishToLounge(selectedDetailNote)}
                className="w-full bg-gradient-to-br from-rose-500 to-rose-700 text-white font-black py-3.5 rounded-xl text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                🍷 라운지에 게시하기
              </button>
            )}

            {/* 📝 즉시 수정하기(Edit) 액션 버튼 소환 */}
            <button
              type="button"
              onClick={() => {
                setSelectedLiquorType(selectedDetailNote.liquorType || 'wine');
                setAnalysisResult(selectedDetailNote.analysisResult || {});
                setPrice(selectedDetailNote.price || '');
                setRatings(selectedDetailNote.originalRatings || selectedDetailNote.ratings || {});
                setSelectedAromas(selectedDetailNote.selectedAromas || []);
                setPersonalNotes(selectedDetailNote.personalNotes || '');
                setOverallRating(selectedDetailNote.overallRating || 50);
                setImage(selectedDetailNote.thumbnail || null);

                setEditingNoteId(selectedDetailNote.id);
                setSelectedDetailNote(null);
                setCurrentView('add');
                showToast("노트 수정 모드로 진입했습니다. 내용을 고친 후 다시 저장하세요!", "info");
              }}
              className="w-full bg-gray-900 hover:bg-black text-white font-black py-3.5 rounded-xl text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              📝 이 테이스팅 노트 수정하기
            </button>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
          <button onClick={() => setSelectedImage(null)} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 rounded-full backdrop-blur-sm transition-colors">
            <Icon name="X" className="w-6 h-6" />
          </button>
          <div className="max-w-full max-h-[80vh] relative" onClick={e => e.stopPropagation()}>
            <img src={selectedImage} alt="Enlarged verification" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10" />
          </div>
          <div className="mt-6 text-center text-white/90 text-sm bg-black/60 px-5 py-2.5 rounded-full backdrop-blur-sm border border-white/20 shadow-lg flex items-center">
            <Icon name="ShieldCheck" className="w-5 h-5 mr-2 text-blue-400 animate-pulse" />
            사진 속의 자필 인증코드를 눈으로 대조하여 도용을 직접 판정하세요!
          </div>
        </div>
      )}

      {selectedDetailNote && isCommunityModal && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedDetailNote(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto space-y-4 border shadow-2xl relative" onClick={e => e.stopPropagation()}>

            <div className="p-4 border-b flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-gray-400">보틀 라운지 상세보기</span>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedDetailNote.userId === user?.uid && (
                  <button onClick={() => handleDeletePost(selectedDetailNote)} className="p-1.5 bg-red-50 hover:bg-red-100 rounded-full transition-colors" title="글 삭제">
                    <Icon name="Trash" className="w-4 h-4 text-red-500" />
                  </button>
                )}
                <button onClick={() => setSelectedDetailNote(null)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                  <Icon name="X" className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">

              <div className="w-full aspect-video bg-gray-50 rounded-2xl overflow-hidden border relative shadow-inner">
                {selectedDetailNote.thumbnail ? (
                  <img src={selectedDetailNote.thumbnail} className="w-full h-full object-cover" alt="Detail Bottle" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl">
                    {LIQUOR_CONFIG[selectedDetailNote.liquorType]?.icon || '🍷'}
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 text-white font-black text-[10px] px-2 py-0.5 rounded-md backdrop-blur-sm">
                  {selectedDetailNote.analysisResult?.type}
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="font-black text-lg text-gray-900 leading-tight">{selectedDetailNote.analysisResult?.name || '이름 없음'}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold">
                  <span>by {selectedDetailNote.userName || '지나간 보틀러'}</span>
                  <span>•</span>
                  <span>{formatTimeAgo(selectedDetailNote.createdAt)}</span>
                </div>
              </div>

              <div className="bg-indigo-50/40 border border-indigo-100/60 p-3.5 rounded-2xl space-y-1.5">
                <div className="flex justify-between items-center text-xs font-black text-indigo-950">
                  <span className="flex items-center gap-0.5">⭐ 누적 부러움 점수</span>
                  <span className="text-indigo-600 font-mono">{(selectedDetailNote.totalCommunityScore || 0).toFixed(1)} 점</span>
                </div>
                <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden shadow-inner">
                  <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full" style={{ width: `${Math.min(100, ((selectedDetailNote.totalCommunityScore || 0) / Math.max(1, (communityPosts[0]?.totalCommunityScore || 100))) * 100)}%` }}></div>
                </div>
              </div>

              {(selectedDetailNote.personalNotes || selectedDetailNote.overallRating) && (
                <div className="text-sm text-gray-700 bg-slate-50 p-4 rounded-2xl border border-gray-100 font-medium leading-relaxed italic flex items-start gap-2">
                  {selectedDetailNote.overallRating ? (
                    <span className="not-italic shrink-0 bg-rose-800 text-white font-black text-xs px-2 py-0.5 rounded-lg font-mono">{selectedDetailNote.overallRating}점</span>
                  ) : null}
                  <span>{selectedDetailNote.personalNotes ? `"${selectedDetailNote.personalNotes}"` : ''}</span>
                </div>
              )}

              {selectedDetailNote.verificationStatus === 'pending_vote' &&
                user && !user.isAnonymous &&
                (user.providerData && user.providerData.length > 0) &&
                selectedDetailNote.votes?.voters?.[user?.uid] === undefined && (
                  <div className="p-4 bg-amber-50/60 border border-amber-200/50 rounded-2xl text-left">
                    <h4 className="text-xs font-black text-amber-950 mb-1">🙋‍♂️ 이 보틀, 실물 인증인가요?</h4>
                    <p className="text-[10px] text-amber-900 leading-relaxed mb-3">
                      쪽지에 적힌 <b>{selectedDetailNote.verificationCodeUsed}</b> 코드가 보이신다면 투표해 주세요!
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => handleVoteVerification(selectedDetailNote.id, 'yes')} className="flex-1 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 font-bold border rounded-xl text-xs shadow-sm">👍 보인다!</button>
                      <button onClick={() => handleVoteVerification(selectedDetailNote.id, 'no')} className="flex-1 py-1.5 bg-white hover:bg-rose-50 text-rose-600 font-bold border rounded-xl text-xs shadow-sm">👎 안 보인다</button>
                    </div>
                  </div>
                )}

              <div className="border-t border-gray-100 pt-3 space-y-3.5">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-xl border border-gray-200/60 shadow-inner gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black text-gray-500 tracking-tight">부러움 점수 드래그 평가</p>
                  </div>
                  {selectedDetailNote.userId === user?.uid ? (
                    <div className="bg-gray-100 border border-gray-200 text-gray-500 font-black text-[10px] px-2.5 py-1 rounded-xl shadow-sm whitespace-nowrap">🍷 내 보틀</div>
                  ) : selectedDetailNote.ratings?.[user?.uid] > 0 && selectedDetailNote.comments?.some(c => c.userId === user?.uid) ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 font-black text-[10px] px-2.5 py-1 rounded-xl shadow-sm whitespace-nowrap">
                      🔒 평가 완료 ({(selectedDetailNote.ratings?.[user?.uid] || 0).toFixed(1)}점)
                    </div>
                  ) : (
                    <div className="shrink-0" onTouchMove={(e) => { if (!e.touches[0]) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.touches[0].clientX - rect.left; const percent = Math.min(Math.max(x / rect.width, 0), 1); const calculated = Math.round(percent * 5 * 2) / 2; setPendingRatings(p => ({ ...p, [selectedDetailNote.id]: calculated })); }}>
                      <FractionalStarRating value={pendingRatings[selectedDetailNote.id] ?? (selectedDetailNote.ratings?.[user?.uid] || 0)} onChange={(score) => setPendingRatings(p => ({ ...p, [selectedDetailNote.id]: score }))} />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-black text-gray-800 flex items-center gap-1">💬 댓글 채팅 목록 ({selectedDetailNote.comments?.length || 0}개)</p>
                  <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                    {(selectedDetailNote.comments || []).map(c => {
                      const commenterRating = selectedDetailNote.ratings?.[c.userId] || 0;
                      const commenterStats = userStats[c.userId] || { badge: '🥚 알콜 입문자' };

                      return (
                        <div key={c.id} className="space-y-1.5 border-b border-gray-100/50 pb-2 last:border-0">
                          {/* 댓글 본체 */}
                          <div className="text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 shadow-sm space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs shrink-0">{commenterStats.badge ? commenterStats.badge.split(' ')[0] : '🥚'}</span>
                              <span className="font-extrabold text-gray-800">{c.userName || '알콜러'}</span>
                              {commenterRating > 0 && <span className="text-[9px] text-amber-500 font-black shrink-0 ml-0.5">★ {commenterRating.toFixed(1)}</span>}
                              <span className="text-[9px] text-gray-400 font-medium ml-auto shrink-0">{formatTimeAgo(c.createdAt)}</span>
                            </div>
                            <p className="text-gray-600 font-medium mt-1 pl-0.5">{c.text}</p>
                            <div className="text-right flex items-center justify-end gap-2">
                              {c.userId === user?.uid && (
                                <button onClick={() => handleDeleteComment(selectedDetailNote, c)} className="text-[10px] font-bold text-red-400 hover:text-red-600 hover:underline mt-1">🗑 삭제</button>
                              )}
                              <button onClick={() => setActiveReplyBox(activeReplyBox === c.id ? null : c.id)} className="text-[10px] font-bold text-indigo-600 hover:underline mt-1">
                                {activeReplyBox === c.id ? '취소' : '↳ 답글 달기'}
                              </button>
                            </div>
                          </div>

                          {/* 대댓글 목록 */}
                          {(c.replies || []).map(r => {
                            const replyStats = userStats[r.userId] || { badge: '🥚 알콜 입문자' };
                            return (
                              <div key={r.id} className="ml-5 text-xs bg-slate-50 p-2 rounded-xl border border-dashed border-gray-200 space-y-1 flex gap-1.5 items-start">
                                <span className="text-gray-400 text-[11px] mt-0.5 shrink-0">↳</span>
                                <div className="flex-1 space-y-0.5">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] shrink-0">{replyStats.badge ? replyStats.badge.split(' ')[0] : '🥚'}</span>
                                    <span className="font-bold text-gray-700">{r.userName || '알콜러'}</span>
                                    <span className="text-[8px] text-gray-400 font-medium ml-auto shrink-0">{formatTimeAgo(r.createdAt)}</span>
                                  </div>
                                  <p className="text-gray-600 font-medium pl-0.5">{r.text}</p>
                                </div>
                              </div>
                            );
                          })}

                          {/* 대댓글 입력창 */}
                          {activeReplyBox === c.id && (
                            <div className="ml-5 flex gap-1.5 pt-1 animate-in slide-in-from-top-2 duration-200">
                              <input type="text" placeholder="답글 내용을 입력하세요..." value={replyInputs[c.id] || ''} onChange={(e) => setReplyInputs(p => ({ ...p, [c.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && handleAddReply(selectedDetailNote.id, c.id)} className="flex-1 border rounded-xl px-2.5 py-1.5 bg-white text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" />
                              <button onClick={() => handleAddReply(selectedDetailNote.id, c.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shrink-0 shadow-sm">등록</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-1 border-t border-gray-100">
                  <input
                    type="text"
                    placeholder="매너 있는 댓글 한마디를 남겨보세요!"
                    value={commentInputs[selectedDetailNote.id] || ''}
                    onChange={(e) => setCommentInputs(p => ({ ...p, [selectedDetailNote.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment(selectedDetailNote.id)}
                    className="flex-1 border rounded-xl px-3 py-2 bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner"
                  />
                  <button onClick={() => handleAddComment(selectedDetailNote.id)} className="bg-gray-800 hover:bg-black text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 shadow-md">
                    <Icon name="Send" className="w-3 h-3 ml-0.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
