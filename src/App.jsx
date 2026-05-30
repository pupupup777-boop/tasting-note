import React, { useState, useRef, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, setDoc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore';

const fallbackConfig = {
  apiKey: "AIzaSyDfsow7Q73INwwaFylX4De6LwKrmEDovcE",
  authDomain: "chill-sip.firebaseapp.com",
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

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'wine-tasting-app';
const appId = rawAppId.replace(/\//g, '_');

// 이전 버전의 안정적인 VITE 환경 변수 및 dynamic fallback 바인딩 복원
const GEMINI_API_KEY = (() => {
  try {
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch (e) {
    return "";
  }
})();

const isApiKeyMissing = !GEMINI_API_KEY || GEMINI_API_KEY.trim() === "";

// 샴페인 전용 기포 상승 애니메이션 효과 스타일시트 상수 정의 (탑레벨 모듈 호이스팅 배치)
const customStyles = `
  @keyframes bubbleRise {
    0% { transform: translateY(110%) scale(0.6); opacity: 0; }
    20% { opacity: 0.7; }
    80% { opacity: 0.7; }
    100% { transform: translateY(-40px) scale(1.1); opacity: 0; }
  }
  .floating-bubble-1 { animation: bubbleRise 5s infinite linear; }
  .floating-bubble-2 { animation: bubbleRise 7s infinite linear 1.5s; }
  .floating-bubble-3 { animation: bubbleRise 6s infinite linear 3s; }
  .floating-bubble-4 { animation: bubbleRise 8s infinite linear 4.5s; }
`;

// 이미지 파일 압축 처리 및 참조 누락 해결을 위한 전역 압축 헬퍼 유틸리티 함수 정의
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
    img.src = base64Str;
  });
};

// Markdown 혹은 잘못 래핑된 JSON 텍스트를 방어적으로 안심 파싱해주는 유틸리티
const safeParseJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const regexBlock = new RegExp("`" + "`" + "`" + "(?:json)?\\s*([\\s\\S]*?)\\s*" + "`" + "`" + "`");
    const match = text.match(regexBlock);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {
        console.error("Markdown JSON block parsing fail:", e2);
      }
    }
    const cleanText = text.replace(/`{3}json|`{3}/g, '').trim();
    try {
      return JSON.parse(cleanText);
    } catch (e3) {
      console.error("Strict text stripping fail:", e3);
      return null;
    }
  }
};

// 시간 가독 표시 헬퍼 함수
const formatTimeAgo = (timestamp) => { 
  if (!timestamp) return ''; 
  const diff = Date.now() - timestamp; 
  const seconds = Math.floor(diff / 1000); 
  if (seconds < 60) return '방금 전'; 
  const minutes = Math.floor(seconds / 60); 
  if (minutes < 60) return `${minutes}분 전`; 
  const hours = Math.floor(minutes / 60); 
  if (hours < 24) return `${hours}시간 전`; 
  const days = Math.floor(hours / 24); 
  if (days < 7) return `${days}일 전`; 
  const date = new Date(timestamp); 
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`; 
};

// 테마 클래스 반환 함수 (Top-level 배치)
const getThemeClasses = (theme) => {
  const map = {
    rose: { bg: 'bg-rose-50/70', text: 'text-rose-900', border: 'border-rose-100', btnBg: 'bg-rose-800 hover:bg-rose-900', gradient: 'from-rose-950 to-indigo-950', bar: 'bg-rose-800' },
    amber: { bg: 'bg-amber-50/70', text: 'text-amber-950', border: 'border-amber-100', btnBg: 'bg-amber-800 hover:bg-amber-950', gradient: 'from-amber-950 to-amber-900', bar: 'bg-amber-800' },
    blue: { bg: 'bg-slate-100/70', text: 'text-slate-900', border: 'border-slate-200', btnBg: 'bg-slate-800 hover:bg-slate-900', gradient: 'from-slate-900 to-indigo-900', bar: 'bg-slate-800' },
    yellow: { bg: 'bg-amber-50/40', text: 'text-yellow-950', border: 'border-amber-200/50', btnBg: 'bg-yellow-700 hover:bg-yellow-850', gradient: 'from-yellow-950 to-amber-950', bar: 'bg-yellow-600' }
  };
  return map[theme] || map.rose;
};

// 와인 세부 타입별 전용 스타일 가이드 반환 함수 (Top-level 배치)
const getWineCardTheme = (style) => {
  if (style === 'white') {
    return {
      gradient: 'from-amber-50 via-yellow-50 to-amber-100/90 text-amber-950 border border-amber-200/60 shadow-inner',
      textColor: 'text-amber-950',
      badgeBg: 'bg-amber-200/50 text-amber-900',
      subText: 'text-amber-900/70',
      glow: 'shadow-[0_0_15px_rgba(251,191,36,0.12)]'
    };
  }
  if (style === 'sparkling') {
    return {
      gradient: 'from-yellow-950 via-amber-900 to-indigo-950 text-white shadow-md relative overflow-hidden',
      textColor: 'text-white',
      badgeBg: 'bg-white/25 text-white backdrop-blur-sm',
      subText: 'text-white/80',
      glow: 'shadow-[0_0_20px_rgba(251,191,36,0.25)]',
      bubbly: true
    };
  }
  if (style === 'dessert') {
    return {
      gradient: 'from-amber-100 via-orange-50 to-yellow-200 text-amber-950 border border-amber-300 shadow-md',
      textColor: 'text-amber-950',
      badgeBg: 'bg-amber-300/40 text-amber-900',
      subText: 'text-amber-900/80',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.18)]'
    };
  }
  // Default Red
  return {
    gradient: 'from-rose-950 to-indigo-950 text-white shadow-md',
    textColor: 'text-white',
    badgeBg: 'bg-white/20 text-white backdrop-blur-sm',
    subText: 'text-white/85',
    glow: 'shadow-[0_0_15px_rgba(153,27,27,0.2)]'
  };
};

const detectCountry = (region) => {
  if (!region) return '기타';
  const r = region.toLowerCase();
  if (r.includes('프랑스') || r.includes('france') || r.includes('보르도') || r.includes('bordeaux') || r.includes('부르고뉴') || r.includes('burgundy') || r.includes('샹페인') || r.includes('champagne')) return '프랑스';
  if (r.includes('이탈리아') || r.includes('italy') || r.includes('토스카나') || r.includes('toscana') || r.includes('피에몬테') || r.includes('piemonte')) return '이탈리아';
  if (r.includes('스페인') || r.includes('spain') || r.includes('리오하') || r.includes('rioja')) return '스페인';
  if (r.includes('미국') || r.includes('usa') || r.includes('america') || r.includes('캘리포니아') || r.includes('california') || r.includes('나파') || r.includes('napa')) return '미국';
  if (r.includes('칠레') || r.includes('chile') || r.includes('센트럴') || r.includes('central valley')) return '칠레';
  if (r.includes('아르헨티나') || r.includes('argentina') || r.includes('멘도사') || r.includes('mendoza')) return '아르헨티나';
  if (r.includes('호주') || r.includes('australia') || r.includes('바로사') || r.includes('barossa')) return '호주';
  if (r.includes('뉴질랜드') || r.includes('new zealand') || r.includes('말보로') || r.includes('marlborough')) return '뉴질랜드';
  if (r.includes('독일') || r.includes('germany') || r.includes('모젤') || r.includes('mosel')) return '독일';
  if (r.includes('포르투갈') || r.includes('portugal')) return '포르투갈';
  if (r.includes('한국') || r.includes('korea') || r.includes('전통주') || r.includes('영동')) return '한국';
  return '기타';
};

const mapPinsCoords = {
  '미국': { x: 125, y: 110 },
  '칠레': { x: 185, y: 235 },
  '아르헨티나': { x: 200, y: 245 },
  '프랑스': { x: 292, y: 100 },
  '이탈리아': { x: 310, y: 108 },
  '스페인': { x: 285, y: 116 },
  '독일': { x: 302, y: 92 },
  '포르투갈': { x: 275, y: 118 },
  '한국': { x: 455, y: 116 },
  '호주': { x: 490, y: 228 },
  '뉴질랜드': { x: 515, y: 250 }
};

const mapContinents = [
  { name: 'N.America', path: 'M 40,70 C 60,60 110,50 145,55 C 160,85 180,95 190,110 C 160,115 150,135 145,145 C 115,150 95,170 85,185 C 65,155 45,130 40,70 Z' },
  { name: 'Greenland', path: 'M 175,25 C 190,20 220,15 225,35 C 205,50 190,55 175,45 Z' },
  { name: 'S.America', path: 'M 145,185 C 170,180 210,210 215,235 C 200,285 180,305 170,310 C 150,270 140,225 145,185 Z' },
  { name: 'Eurasia', path: 'M 255,85 C 280,65 340,55 425,55 C 500,50 545,65 565,95 C 555,140 515,160 485,165 C 445,160 425,180 395,165 C 345,160 295,135 255,85 Z' },
  { name: 'Africa', path: 'M 270,150 C 310,145 350,165 365,210 C 350,265 325,295 305,300 C 285,250 265,200 270,150 Z' },
  { name: 'Australia', path: 'M 465,225 C 510,225 530,255 515,275 C 475,275 455,255 465,225 Z' }
];

const LIQUOR_CONFIG = {
  wine: {
    id: 'wine', name: '와인', icon: '🍷', theme: 'rose'
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

// 분수 전용 별점 컴포넌트
const FractionalStarRating = ({ value, onChange }) => {
  const [hoverValue, setHoverValue] = useState(null);
  const ratingRef = useRef(null);
  const displayValue = hoverValue !== null ? hoverValue : value;

  const handleMouseMove = (e) => {
    if (!ratingRef.current) return;
    const rect = ratingRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percent = Math.min(Math.max(x / width, 0), 1);
    const calculated = Math.round(percent * 5 * 2) / 2;
    setHoverValue(calculated);
  };

  const handleMouseLeave = () => setHoverValue(null);
  const handleClick = () => { if (onChange) onChange(displayValue); };

  return (
    <div className="flex items-center space-x-2 bg-white px-3 py-1 rounded-xl border border-gray-100 shadow-sm">
      <div
        ref={ratingRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="flex cursor-pointer py-1 select-none"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFull = displayValue >= star;
          const isHalf = !isFull && displayValue >= star - 0.5;
          return (
            <button key={star} type="button" className="p-0.5 focus:outline-none transition-transform active:scale-110">
              <Icon
                name="Star"
                className={`w-5 h-5 ${isFull ? 'text-amber-400 fill-current' : isHalf ? 'text-amber-400 fill-current' : 'text-gray-200'}`}
                style={isHalf ? { clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0% 100%)' } : undefined}
              />
            </button>
          );
        })}
      </div>
      <span className="text-sm font-black text-amber-500 font-mono shrink-0 bg-amber-50/50 px-2 py-0.5 rounded border border-amber-100">{displayValue.toFixed(1)}</span>
    </div>
  );
};

// 전역 Icon 컴포넌트 선언
const Icon = ({ name, className = "w-5 h-5", style = {} }) => {
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
    BarChart3: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M18 17V9M13 17V5M8 17v-7" />
  };
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" style={style}>
      {icons[name] || <circle cx="12" cy="12" r="10" strokeWidth="2" />}
    </svg>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [currentView, setCurrentView] = useState('community');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
  };

  // Profiles & Lounge Data states
  const [userProfile, setUserProfile] = useState({ nickname: '', badge: '🥚 알콜 입문자' });
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityFilter, setCommunityFilter] = useState('all');
  const [communitySort, setCommunitySort] = useState('latest');
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [activeReplyBox, setActiveReplyBox] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const [subTab, setSubTab] = useState('lounge');
  const [isCommunityModal, setIsCommunityModal] = useState(false);

  const [selectedLiquorType, setSelectedLiquorType] = useState('wine');

  const [wineColor, setWineColor] = useState('');
  const [wineColorTone, setWineColorTone] = useState('');
  const [wineClarity, setWineClarity] = useState('');
  const [wineViscosity, setWineViscosity] = useState('');

  const [aromaIntensity, setAromaIntensity] = useState('중간');

  const [finishLength, setFinishLength] = useState('');
  const [evolutionFirst, setEvolutionFirst] = useState('');
  const [evolutionTime, setEvolutionTime] = useState('');
  const [evolutionBetter, setEvolutionBetter] = useState('');
  const [foodPairing, setFoodPairing] = useState('');

  const [wineStyle, setWineStyle] = useState('red');

  const [image, setImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);
  const [price, setPrice] = useState('');
  const [vintage, setVintage] = useState('');
  const [ratings, setRatings] = useState({});
  const [selectedAromas, setSelectedAromas] = useState([]);
  const [personalNotes, setPersonalNotes] = useState('');
  const [overallRating100, setOverallRating100] = useState(80);
  const [expandedAromaCategory, setExpandedAromaCategory] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [selectedDetailNote, setSelectedDetailNote] = useState(null);
  const [openComments, setOpenComments] = useState({});
  const [showRankModal, setShowRankModal] = useState(false);

  const [isAnalyzingTaste, setIsAnalyzingTaste] = useState(false);
  const [tasteAnalysisResult, setTasteAnalysisResult] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const [listStyleFilter, setListStyleFilter] = useState('all');
  const [listSortOption, setListSortOption] = useState('latest');
  const [listCountryFilter, setListCountryFilter] = useState('all');
  const [listLayoutMode, setListLayoutMode] = useState('list');

  const fileInputRef = useRef(null);

  // [esbuild Hoisting 보장을 위한 표준 내부 함수 정의 구역] ----------------------------------------------------
  
  function triggerFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await compressImage(reader.result, 300);
      setImage(compressed);
      analyzeLabel(compressed);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function resetForm() {
    setImage(null);
    setAnalysisResult(null);
    setPrice('');
    setVintage('');
    setRatings({});
    setSelectedAromas([]);
    setPersonalNotes('');
    setOverallRating100(80);
    setShareToCommunity(false);
    setEditingNoteId(null);

    setWineColor('');
    setWineColorTone('');
    setWineClarity('');
    setWineViscosity('');
    setAromaIntensity('중간');
    setFinishLength('');
    setEvolutionFirst('');
    setEvolutionTime('');
    setEvolutionBetter('');
    setFoodPairing('');
    setWineStyle('red');
  }

  function renderRatingBar(criteria) {
    const theme = getThemeClasses(LIQUOR_CONFIG[selectedLiquorType].theme);
    return (
      <div key={criteria.id} className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="font-medium text-gray-700 text-sm">{criteria.label}</span>
          <span className={`text-xs font-bold ${theme.text} ${theme.bg} px-2 py-1 rounded-full`}>
            {ratings[criteria.id] || 0}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500 w-10 text-right shrink-0">{criteria.minLabel}</span>
          <div className="flex-1 flex justify-between">
            {[1, 2, 3, 4, 5].map((val) => {
              const isActive = (ratings[criteria.id] || 0) >= val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRatings(p => ({ ...p, [criteria.id]: val }))}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isActive ? `${theme.bar} text-white shadow-md transform scale-105` : 'bg-gray-100 text-gray-400'
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
  }

  function navigateTo(view) {
    setCurrentView(view);
    setIsMenuOpen(false);
  }

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
      userBadges[uid] = { badge, isTop, totalScore: s, rank: index + 1 };
    });
    return userBadges;
  }, [communityPosts]);

  const activeWineConfig = useMemo(() => {
    if (wineStyle === 'white') {
      return {
        criteria: [
          { id: 'body', label: '바디감', minLabel: 'Light', maxLabel: 'Full' },
          { id: 'acidity', label: '산도(신맛)', minLabel: 'Low', maxLabel: 'High' },
          { id: 'sweetness', label: '당도(단맛)', minLabel: 'Dry', maxLabel: 'Sweet' },
        ],
        aromas: [
          { category: '과일 (Fruit)', items: ['레몬', '라임', '자몽', '사과', '배', '복숭아', '살구', '열대과일(망고, 파인애플)', '멜론'] },
          { category: '플로럴 (Floral)', items: ['아카시아', '자스민', '장미', '백합', '국화'] },
          { category: '오크 / 숙성 (Oak / Aging)', items: ['버터', '바닐라', '토스트', '헤이즐넛', '아몬드'] },
          { category: '허브 / 식물 (Herbal)', items: ['허브', '풀', '민트', '피망(그린)', '아스파라거스'] },
          { category: '기타 (Other)', items: ['미네랄(돌, 석회질)', '꿀', '페트롤(석유향)', '스모키'] }
        ]
      };
    } else if (wineStyle === 'sparkling') {
      return {
        criteria: [
          { id: 'body', label: '바디감', minLabel: 'Light', maxLabel: 'Full' },
          { id: 'sweetness', label: '당도(단맛)', minLabel: 'Dry', maxLabel: 'Sweet' },
          { id: 'acidity', label: '산도(신맛)', minLabel: 'Low', maxLabel: 'High' },
          { id: 'mousse', label: '기포감 (Mousse)', minLabel: 'Coarse', maxLabel: 'Fine' },
        ],
        aromas: [
          { category: '과일 (Fruit)', items: ['레몬', '라임', '자몽', '사과', '배', '복숭아', '살구', '파인애플', '망고', '딸기(로제)', '체리(로제)'] },
          { category: '플로럴 / 허브 (Floral / Herbal)', items: ['흰꽃', '아카시아', '장미', '허브'] },
          { category: '효모 / 브레드 (Yeast / Bread)', items: ['브리오슈', '토스트', '버터', '크림', '이스트'] },
          { category: '숙성 / 견과류 (Nutty / Aged)', items: ['아몬드', '헤이즐넛', '호두', '꿀', '버섯'] },
          { category: '기타 (Other)', items: ['미네랄(돌, 초크)', '스모키', '오크'] }
        ]
      };
    } else if (wineStyle === 'dessert') {
      return {
        criteria: [
          { id: 'sweetness', label: '당도(단맛)', minLabel: 'Sweet', maxLabel: 'Luscious' },
          { id: 'acidity', label: '산도(신맛)', minLabel: 'Low', maxLabel: 'High' },
          { id: 'body', label: '바디감', minLabel: 'Light', maxLabel: 'Full' },
          { id: 'complexity', label: '복합미', minLabel: 'Simple', maxLabel: 'Complex' }
        ],
        aromas: [
          { category: '말린 과일 (Dried Fruit)', items: ['살구', '무화과', '건포도', '대추야자', '오렌지 필'] },
          { category: '달콤함 (Sweet Honey/Spice)', items: ['꿀', '메이플시럽', '카라멜', '바닐라', '시나몬', '사프란'] },
          { category: '견과류 / 버섯 (Nutty / Noble Rot)', items: ['아몬드', '호두', '헤이즐넛', '귀부버섯향(Botrytis)', '흙', '버섯'] },
          { category: '꽃 / 과일 (Floral / Fruit)', items: ['아카시아', '자스민', '오렌지 블러썸', '복숭아', '망고', '리치'] }
        ]
      };
    } else {
      return {
        criteria: [
          { id: 'body', label: '바디감', minLabel: 'Light', maxLabel: 'Full' },
          { id: 'acidity', label: '산도(신맛)', minLabel: 'Low', maxLabel: 'High' },
          { id: 'tannin', label: '타닌', minLabel: 'Low', maxLabel: 'High' },
          { id: 'sweetness', label: '당도(단맛)', minLabel: 'Dry', maxLabel: 'Sweet' },
        ],
        aromas: [
          { category: '과일 (Fruit)', items: ['체리', '라즈베리', '딸기', '자두', '블랙베리', '블랙커런트', '건과일'] },
          { category: '식물 / 허브 (Herbal)', items: ['허브', '민트', '유칼립투스', '피망(그린)'] },
          { category: '스파이스 (Spice)', items: ['후추', '시나몬', '정향', '감초'] },
          { category: '오크 / 숙성 (Oak / Aging)', items: ['바닐라', '토스트', '초콜릿', '커피', '스모키', '코코아'] },
          { category: '숙성 / 복합 (Development)', items: ['가죽', '버섯', '흙(earthy)', '트러플'] }
        ]
      };
    }
  }, [wineStyle]);

  const processedNotesList = useMemo(() => {
    let result = [...notes];

    if (listStyleFilter !== 'all') {
      if (['red', 'white', 'sparkling', 'dessert'].includes(listStyleFilter)) {
        result = result.filter(n => n.liquorType === 'wine' && n.wineStyle === listStyleFilter);
      } else {
        result = result.filter(n => n.liquorType === listStyleFilter);
      }
    }

    if (listCountryFilter !== 'all') {
      result = result.filter(n => detectCountry(n.analysisResult?.region) === listCountryFilter);
    }

    result.sort((a, b) => {
      if (listSortOption === 'latest') return b.createdAt - a.createdAt;
      if (listSortOption === 'rateDesc') return (b.overallRating100 || 0) - (a.overallRating100 || 0);
      if (listSortOption === 'rateAsc') return (a.overallRating100 || 0) - (b.overallRating100 || 0);
      if (listSortOption === 'priceDesc') return (b.price || 0) - (a.price || 0);
      if (listSortOption === 'priceAsc') return (a.price || 0) - (b.price || 0);
      return 0;
    });

    return result;
  }, [notes, listStyleFilter, listSortOption, listCountryFilter]);

  const countryCountsMap = useMemo(() => {
    const counts = {};
    notes.forEach(n => {
      const country = detectCountry(n.analysisResult?.region);
      counts[country] = (counts[country] || 0) + 1;
    });
    return counts;
  }, [notes]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.warn("Auth initial session loaded:", e);
        setUser({ uid: 'mock-user-' + Math.floor(Math.random() * 10000), isAnonymous: true });
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const q = query(notesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt - a.createdAt);
      setNotes(data);
      try {
        localStorage.setItem(`tasting_notes_${user.uid}`, JSON.stringify(data));
      } catch (backupErr) {}
    }, (err) => {
      console.warn("Firestore snapshot 권한이 부재하여 LocalStorage 데이터로 우회 연동을 수행합니다:", err);
      try {
        const localNotes = localStorage.getItem(`tasting_notes_${user.uid}`);
        if (localNotes) setNotes(JSON.parse(localNotes));
      } catch (backupErr) {}
    });

    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'info');
    const unsubscribeProfile = onSnapshot(profileRef, (profileSnap) => {
      if (profileSnap.exists()) {
        setUserProfile((p) => ({ ...p, ...profileSnap.data() }));
      } else {
        const randomNickname = '테이스터_' + Math.floor(1000 + Math.random() * 9000);
        setDoc(profileRef, { nickname: randomNickname, createdAt: Date.now() }).catch(() => {});
        setUserProfile((p) => ({ ...p, nickname: randomNickname }));
      }
    }, (err) => {
      console.warn("프로필 권한 제한 감지, 로컬 가상 프로필을 적용합니다.");
      setUserProfile((p) => ({ ...p, nickname: p.nickname || '테이스터_가상' }));
    });

    return () => {
      unsubscribe();
      unsubscribeProfile();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const publicRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
    const unsubscribe = onSnapshot(query(publicRef), (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setCommunityPosts(data);
      try {
        localStorage.setItem('lounge_posts_backup', JSON.stringify(data));
      } catch (e) {}
    }, (err) => {
      console.warn("Community onSnapshot 권한 제한 감지, 백업 정보를 활성화합니다.");
      try {
        const localPosts = localStorage.getItem('lounge_posts_backup');
        if (localPosts) setCommunityPosts(JSON.parse(localPosts));
      } catch (e) {}
    });
    return () => unsubscribe();
  }, [user]);

  const handleGoogleLogin = async () => {
    const isSandbox = window.location.hostname.includes('goog') || window.location.hostname.includes('localhost') || window.location.protocol === 'blob:';
    
    if (isSandbox) {
      showToast("샌드박스 환경이 감지되어 커스텀 프로필 생성 창을 활성화합니다.", "info");
      setShowLoginModal(false);
      setNicknameInput(userProfile.nickname || '보틀러_' + Math.floor(1000 + Math.random() * 9000));
      setShowNicknameModal(true);
      return;
    }

    try {
      showToast("구글 로그인을 시도합니다...", "info");

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const loggedInUser = result.user;

      const profileRef = doc(db, 'artifacts', appId, 'users', loggedInUser.uid, 'profile', 'info');
      const { getDoc } = await import('firebase/firestore');
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

    } catch (error) {
      console.warn("Google Login failed (Graceful Sandbox Bypass):", error);
      showToast("인증 환경 제약 감지: 커스텀 안심 프로필 조율을 수행합니다.", "info");
      setShowLoginModal(false);
      setNicknameInput(userProfile.nickname || '보틀러_' + Math.floor(1000 + Math.random() * 9000));
      setShowNicknameModal(true);
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
      console.warn("닉네임 원격 저장 제한, 로컬에만 한시적으로 보관합니다.");
      setUserProfile(p => ({ ...p, nickname: nextName }));
      setShowNicknameModal(false);
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

  const handleSaveNote = async () => {
    if (!analysisResult) {
      showToast("라벨 분석이 아직 완료되지 않았습니다.", "error");
      return;
    }
    if (!user) {
      showToast("로그인이 완료되지 않았습니다.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const smallImage = image ? await compressImage(image, 300) : null;

      const newNote = {
        liquorType: selectedLiquorType,
        wineStyle: selectedLiquorType === 'wine' ? wineStyle : null,
        analysisResult: {
          ...analysisResult,
          vintage: vintage || analysisResult.vintage || '정보없음'
        },
        price: Number(price) || 0,
        ratings,
        selectedAromas,
        personalNotes,
        overallRating100,
        overallRating: Math.round(overallRating100 / 20 * 2) / 2,
        thumbnail: smallImage,
        createdAt: Date.now(),
        visual: {
          color: wineColor,
          colorTone: wineColorTone,
          clarity: wineClarity,
          viscosity: wineViscosity
        },
        aromaIntensity,
        finish: {
          length: finishLength,
          evolutionFirst,
          evolutionTime,
          evolutionBetter
        },
        foodPairing
      };

      if (editingNoteId) {
        try {
          const noteDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'notes', editingNoteId);
          await setDoc(noteDocRef, newNote, { merge: true });
        } catch (fsErr) {
          console.warn("Firestore 원격 수정 권한 없음, 로컬 가상 스토리지에 즉시 기록을 남깁니다.");
          const localNotes = JSON.parse(localStorage.getItem(`tasting_notes_${user.uid}`) || '[]');
          const idx = localNotes.findIndex(n => n.id === editingNoteId);
          if (idx !== -1) {
            localNotes[idx] = { ...localNotes[idx], ...newNote };
            localStorage.setItem(`tasting_notes_${user.uid}`, JSON.stringify(localNotes));
            setNotes(localNotes);
          }
        }
        showToast("테이스팅 노트가 완벽히 수정되었습니다!", "success");
      } else {
        const generatedId = 'local_' + Date.now();
        let 원격저장성공 = false;
        try {
          const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
          await addDoc(notesRef, newNote);
          원격저장성공 = true;
        } catch (fsErr) {
          console.warn("Firestore 원격 저장 권한 부재, 로컬 데이터베이스에 기록합니다.");
          const localNotes = JSON.parse(localStorage.getItem(`tasting_notes_${user.uid}`) || '[]');
          localNotes.unshift({ id: generatedId, ...newNote });
          localStorage.setItem(`tasting_notes_${user.uid}`, JSON.stringify(localNotes));
          setNotes(localNotes);
        }

        if (shareToCommunity && 원격저장성공) {
          try {
            const communityRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
            await addDoc(communityRef, {
              ...newNote,
              userId: user.uid,
              userName: userProfile.nickname,
              totalCommunityScore: 0,
              ratings: { [user.uid]: Math.round(overallRating100 / 20 * 2) / 2 },
              originalRatings: ratings,
              comments: [],
              isVerified: true,
              verificationStatus: 'community_verified'
            });
          } catch (commErr) {
            console.warn("라운지 공유 권한 없음");
          }
        }
        showToast("프리미엄 테이스팅 노트가 완벽히 저장되었습니다!", "success");
      }

      resetForm();
      navigateTo('list');
    } catch (err) {
      showToast("저장 중 오류 발생: " + err.message, "error");
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

  const handleRatePost = async (postId, currentRatings, score) => {
    if (!user) return;
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postId);
    try {
      const updatedRatings = { ...(currentRatings || {}) };
      updatedRatings[user.uid] = score;
      const totalScore = Object.values(updatedRatings).reduce((acc, curr) => acc + curr, 0);
      await updateDoc(postRef, { ratings: updatedRatings, totalCommunityScore: totalScore });

      if (selectedDetailNote && selectedDetailNote.id === postId) {
        setSelectedDetailNote(prev => ({ ...prev, ratings: updatedRatings, totalCommunityScore: totalScore }));
      }

      showToast(`${score}점을 부여했습니다!`);
    } catch (err) {
      showToast("평가 중 오류가 발생했습니다.", "error");
    }
  };

  const handleAddComment = async (postId) => {
    if (!user || !commentInputs[postId]?.trim()) return;
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postId);
    try {
      const newComment = {
        id: Date.now().toString() + Math.random(), userId: user.uid, userName: userProfile.nickname, text: commentInputs[postId].trim(), createdAt: Date.now()
      };
      await updateDoc(postRef, { comments: arrayUnion(newComment) });

      if (selectedDetailNote && selectedDetailNote.id === postId) {
        setSelectedDetailNote(prev => ({ ...prev, comments: [...(prev.comments || []), newComment] }));
      }

      setCommentInputs(p => ({ ...p, [postId]: '' }));
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

  const handleSearchLiquor = async () => {
    if (!searchQuery.trim()) return;
    
    // API Key 부재시 프론트엔드 에러 방어 처리
    if (isApiKeyMissing) {
      showToast("Vite/Vercel 환경변수(VITE_GEMINI_API_KEY) 설정이 부재합니다. 관리자 콘솔을 확인해 주세요.", "error");
      return;
    }

    setIsSearching(true);
    setSearchResult(null);

    let correctedName = searchQuery;

    try {
      const basicPayload = {
        contents: [{
          role: "user",
          parts: [{
            text: `"${searchQuery}" 술의 한글/영문 공식 명칭, 역사와 특징 요약(1~2줄), 그리고 주요 테이스팅 노트(아로마, 팔레트, 피니시)를 아래 지정된 JSON 규격으로 알려줘. 
            중요: 키보드 오타 혹은 한영 변환 오타(예: qkfqpsl12년 -> 발베니 12년)가 있는 경우에도 반드시 가장 유력한 정상 한글 술 이름으로 완벽히 복원해서 "name" field에 채워주세요. 다른 설명 없이 오직 JSON만 반환해야 해.
            {
              "name": "술 공식 명칭",
              "summary": "역사 및 특징 요약",
              "tasting": "아로마, 팔레트, 피니시 특징"
            }`
          }]
        }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const basicResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basicPayload)
      });

      if (basicResponse.ok) {
        const basicResult = await basicResponse.json();
        if (basicResult.candidates?.[0]?.content?.parts?.[0]?.text) {
          const parsedBasic = safeParseJSON(basicResult.candidates[0].content.parts[0].text);
          if (parsedBasic && parsedBasic.name) {
            correctedName = parsedBasic.name;
            setSearchResult({
              ...parsedBasic,
              avgPrice: "실시간 시세 파악 중...",
              avgPriceSource: "출처 확인 중...",
              bargainInfo: "최저가 정보 수집 중...",
              bargainInfoSource: "출처 확인 중...",
              sources: []
            });
          }
        }
      }
    } catch (basicErr) {
      console.error("기본 정보 매핑 실패:", basicErr);
    }

    const maxRetries = 2;
    let delay = 800;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const pricePayload = {
          contents: [{
            role: "user",
            parts: [{
              text: `
                당신은 주류 가격 정보 탐색기입니다. 
                구글 검색 도구(google_search)를 사용해 오직 아래 2개의 핵심 키워드로만 빠르게 정보를 탐색해 주세요.
                - 검색 키워드 1: "${correctedName} 네이버 쇼핑 가격비교"
                - 검색 키워드 2: "${correctedName} 데일리샷"

                [검색 및 요약 지침]
                1. "평균 시세(avgPrice)": 데일리샷이나 네이버 가격비교의 전반적인 가격 범위(예: "115,000원 ~ 125,000원")를 기재하세요.
                2. "최근 성지 및 최저가 정보(bargainInfo)": 네이버 쇼핑 가격비교 등에서 확인되는 스마트오더 최저가나 가장 낮은 할인 가격 정보(예: "98,000원")를 빠르게 포착하세요.
                3. 검색 성능 향상을 위해 복잡한 블로그 분석이나 오프라인 매장 위치 수집은 일절 생략하고, 검색 최상단 가격비교 탭에 바로 나오는 가격 숫자에만 타겟을 맞춰 반응하세요.
                4. 단서가 없으면 "정보없음"을 반환하세요.

                오직 아래 JSON 규격으로만 간결하게 응답하세요:
                {
                  "avgPrice": "시중 평균 가격 정보 (예: 110,000원 ~ 125,000원)",
                  "avgPriceSource": "평균가 출처 (예: 데일리샷)",
                  "bargainInfo": "포착된 최저가 정보 (예: 98,000원 (네이버 쇼핑 최저가))",
                  "bargainInfoSource": "최저가 출처 (예: 네이버 쇼핑 가격비교)"
                }
              `
            }]
          }],
          tools: [{ "google_search": {} }]
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);

        const priceResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pricePayload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!priceResponse.ok) throw new Error(`Status ${priceResponse.status}`);

        const priceResult = await priceResponse.json();
        const candidate = priceResult.candidates?.[0];

        if (candidate?.content?.parts?.[0]?.text) {
          const parsedPrice = safeParseJSON(candidate.content.parts[0].text);
          let groundings = [];

          if (candidate.groundingMetadata?.groundingChunks) {
            groundings = candidate.groundingMetadata.groundingChunks
              .map(chunk => ({ uri: chunk.web?.uri, title: chunk.web?.title }))
              .filter(src => src.uri && src.title);
          }

          if (parsedPrice) {
            const findLink = (sourceName) => {
              if (!sourceName || sourceName === '정보없음') return null;
              const lowerSrc = sourceName.toLowerCase();
              const match = groundings.find(g => {
                const url = g.uri.toLowerCase();
                return url.includes(lowerSrc) || g.title.toLowerCase().includes(lowerSrc) ||
                  (lowerSrc.includes('데일리샷') && url.includes('dailyshot')) ||
                  (lowerSrc.includes('네이버') && url.includes('naver'));
              });
              return match ? match.uri : (groundings[0]?.uri || null);
            };

            setSearchResult(prev => {
              if (!prev) return null;
              return {
                ...prev,
                avgPrice: parsedPrice.avgPrice || "정보없음",
                avgPriceSource: parsedPrice.avgPriceSource || "정보없음",
                avgPriceLink: findLink(parsedPrice.avgPriceSource),
                bargainInfo: parsedPrice.bargainInfo || "정보없음",
                bargainInfoSource: parsedPrice.bargainInfoSource || "정보없음",
                bargainInfoLink: findLink(parsedPrice.bargainInfoSource) || groundings[1]?.uri || groundings[0]?.uri,
                sources: groundings
              };
            });
          }
          break;
        }
      } catch (priceErr) {
        console.warn(`시세 검색 ${i + 1}회차 실패:`, priceErr);
        if (i === maxRetries - 1) {
          setSearchResult(prev => {
            if (!prev) return null;
            return {
              ...prev,
              avgPrice: prev.avgPrice === "실시간 시세 파악 중..." ? "정보없음" : prev.avgPrice,
              avgPriceSource: prev.avgPriceSource === "출처 확인 중..." ? "정보없음" : prev.avgPriceSource,
              bargainInfo: prev.bargainInfo === "최저가 정보 수집 중..." ? "정보없음" : prev.bargainInfo,
              bargainInfoSource: prev.bargainInfoSource === "출처 확인 중..." ? "정보없음" : prev.bargainInfoSource,
              sources: prev.sources || []
            };
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 1.5;
        }
      }
    }
    setIsSearching(false);
  };

  const handleAnalyzeTasteLocal = () => {
    handleAnalyzeTaste();
  };

  const handleAnalyzeTaste = async () => {
    if (notes.length < 5) return;
    
    if (isApiKeyMissing) {
      showToast("Vite/Vercel 환경변수(VITE_GEMINI_API_KEY) 설정이 부재합니다.", "error");
      return;
    }

    setIsAnalyzingTaste(true);
    setTasteAnalysisResult(null);

    const compressedNotesSummary = notes.slice(0, 10).map((n, index) => {
      return `[보틀 ${index + 1}] 명칭: ${n.analysisResult?.name || '정보없음'}, 주종: ${n.liquorType} (${n.wineStyle || '일반'}), 평점: ${n.overallRating100}점, 메모: ${n.personalNotes || '메모없음'}`;
    }).join('\n');

    try {
      const payload = {
        contents: [{
          role: "user",
          parts: [{
            text: `당신은 초임계 와인 에듀케이터 및 취향 설계사입니다. 다음 유저의 최근 주류 테이스팅 데이터셋을 보고 이 유저의 고유한 술 선호 맛 특징을 짧고 강렬하게 요약 분석해 주세요.
            
            [유저의 마신 내역]
            ${compressedNotesSummary}

            반드시 아래에 규정된 지정 마크다운 블록이 전혀 배제된 순수한 JSON 규격으로만 한글 응답하세요:
            {
              "summary": "종합 취향 요약 (마신 술을 기반으로 어떤 주종/맛을 극도로 선호하는지 1줄 요약)",
              "howToDrink": "가장 맛있게 마시는 방법 제안 (온도, 에어레이션 기법, 전용 잔 추천 등 아주 짧게 1줄)",
              "bestPick": "수집된 보틀 중 최고의 테이스팅 타입 및 그 추천 이유 (아주 짧게 1줄)",
              "studyWine": "한 번도 마셔보지 않았지만 본인 취향을 넓히기 위해 다음 단계로 공부해 볼 만한 강력 추천 와인 품종/타입 (아주 짧게 1줄)"
            }`
          }]
        }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (responseText) {
          const parsed = safeParseJSON(responseText);
          if (parsed) {
            setTasteAnalysisResult(parsed);
          }
        }
      } else {
        throw new Error("Gemini AI Taste report generation failed");
      }
    } catch (e) {
      console.error("취향 분석 호출 실패:", e);
      showToast("AI 취향 분석 결과를 로드하는 데 실패했습니다.", "error");
    } finally {
      setIsAnalyzingTaste(false);
    }
  };

  function analyzeLabel(base64Image) {
    if (isApiKeyMissing) {
      showToast("환경변수 바인딩 누락으로 수기 가이드 작성이 즉시 활성화됩니다.", "info");
      setError("라벨 정밀 인식이 지연되어 수기 테이스팅 노트 입력을 진행합니다.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    const base64Data = base64Image.split(',')[1];
    const config = LIQUOR_CONFIG[selectedLiquorType];

    const payload = {
      contents: [{
        role: "user",
        parts: [
          {
            text: `주류 라벨 이미지 분석 요청.
            현재 선택한 주종 카테고리는 '${config.name || "와인"}'입니다.
            
            반드시 아래 지정된 마크다운 없는 순수 JSON 양식에만 정확히 맞춰서 응답해 주세요. 다른 설명글이나 머리말은 일절 배제하세요:
            {
              "name": "추출된 주류의 정확한 한글 및 영문 명칭",
              "type": "상세 품종 및 분류 정보 (예: 레드 와인, 화이트 와인, 샴페인, 싱글몰트 위스키)",
              "region": "생산 국가 및 정밀 상세 지역",
              "vintage": "빈티지 연도 또는 숙성 년수 (없으면 '정보없음')",
              "detectedCategory": "실제 주종에 맞춰 'wine', 'whiskey', 'sake', 'beer' 중 하나 선택"
            }`
          },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const maxRetries = 2;
    let delay = 1000;

    const runCall = async (retryCount, currentDelay) => {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API failed with status ${response.status}`);
        
        const result = await response.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
          const parsed = safeParseJSON(responseText);
          if (parsed) {
            setAnalysisResult(parsed);

            if (parsed.detectedCategory && parsed.detectedCategory !== selectedLiquorType) {
              if (LIQUOR_CONFIG[parsed.detectedCategory]) {
                setSelectedLiquorType(parsed.detectedCategory);
                showToast(`주종을 감지하여 자동으로 '${LIQUOR_CONFIG[parsed.detectedCategory].name}'으로 변경했습니다!`, 'success');
              }
            }

            if (parsed.detectedCategory === 'wine' || selectedLiquorType === 'wine') {
              const wineTypeStr = (parsed.type || "").toLowerCase();
              const wineNameStr = (parsed.name || "").toLowerCase();
              if (wineTypeStr.includes("화이트") || wineTypeStr.includes("white") || wineNameStr.includes("white") || wineNameStr.includes("화이트")) {
                setWineStyle("white");
              } else if (wineTypeStr.includes("샴페인") || wineTypeStr.includes("스파클링") || wineTypeStr.includes("sparkling") || wineTypeStr.includes("champagne") || wineNameStr.includes("champagne")) {
                setWineStyle("sparkling");
              } else if (wineTypeStr.includes("디저트") || wineTypeStr.includes("dessert") || wineNameStr.includes("dessert") || wineNameStr.includes("디저트")) {
                setWineStyle("dessert");
              } else {
                setWineStyle("red");
              }
            }

            setIsAnalyzing(false);
            return; 
          }
        }
        throw new Error("Invalid response format");
      } catch (err) {
        console.warn("라벨 인식이 임시 지연되어 수기 조율합니다:", err);
        if (retryCount === maxRetries - 1) {
          setError("라벨 정밀 인식이 지연되어 수기 테이스팅 노트 입력을 진행합니다.");
          setIsAnalyzing(false);
        } else {
          setTimeout(() => runCall(retryCount + 1, currentDelay * 2), currentDelay);
        }
      }
    };

    runCall(0, delay);
  }

  // [각 개별 뷰 렌더러 함수 그룹]
  function renderAddView() {
    const config = LIQUOR_CONFIG[selectedLiquorType];
    const theme = getThemeClasses(config.theme);
    const activeConfig = selectedLiquorType === 'wine' ? activeWineConfig : config;
    const wineCardTheme = selectedLiquorType === 'wine' ? getWineCardTheme(wineStyle) : { gradient: 'from-rose-950 to-indigo-950 text-white shadow-md' };

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
                  type="button"
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
          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

          {!image ? (
            <div onClick={triggerFileInput} className={`border-2 border-dashed ${theme.border} rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors group flex flex-col items-center justify-center h-48 bg-gray-50/50`}>
              <Icon name="Camera" className={`w-12 h-12 ${theme.text} opacity-50 mb-3`} />
              <p className={`font-medium ${theme.text}`}>라벨 사진 촬영</p>
              <p className="text-xs text-gray-400 mt-1">AI가 품종, 원재료 및 테마를 자동 감지합니다</p>
            </div>
          ) : (
            <div onClick={triggerFileInput} className="relative rounded-xl overflow-hidden shadow-inner border border-gray-200 cursor-pointer group">
              <img src={image} alt="Label" className="w-full h-48 object-contain bg-gray-100 transition-opacity group-hover:opacity-75" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-bold transition-opacity text-sm">
                📸 터치하여 다른 사진으로 촬영/변경
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-4 flex flex-col items-center justify-center p-4 bg-gray-50 text-gray-800 rounded-xl border">
              <Icon name="Loader2" className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm font-medium">AI가 라벨을 분석 중입니다...</p>
            </div>
          )}
          {error && <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">{error}</div>}

          {analysisResult && !isAnalyzing && (
            <div className="mt-6 space-y-4">
              <div className={`bg-gradient-to-br ${wineCardTheme.gradient} rounded-xl p-5 shadow-md relative overflow-hidden transition-all duration-300 ${wineCardTheme.glow}`}>
                {wineCardTheme.bubbly && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 z-0">
                    <div className="absolute bottom-[-10px] left-[15%] w-2 h-2 bg-white/70 rounded-full floating-bubble-1"></div>
                    <div className="absolute bottom-[-10px] left-[35%] w-3 h-3 bg-white/70 rounded-full floating-bubble-2"></div>
                    <div className="absolute bottom-[-10px] left-[65%] w-1.5 h-1.5 bg-white/70 rounded-full floating-bubble-3"></div>
                    <div className="absolute bottom-[-10px] left-[80%] w-2.5 h-2.5 bg-white/70 rounded-full floating-bubble-4"></div>
                  </div>
                )}
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-lg font-bold leading-tight pr-2">{analysisResult.name}</h2>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${wineCardTheme.badgeBg}`}>{analysisResult.type}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-y-2.5 text-sm border-t border-dashed border-gray-200/20 pt-3">
                    <div>
                      <span className={`block text-[10px] font-bold uppercase mb-0.5 ${wineCardTheme.subText}`}>생산지 (Region/Country)</span>
                      <span className="font-black block text-sm leading-tight break-all">{analysisResult.region || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/10 px-3 py-1.5 rounded-lg">
                      <span className={`text-[10px] font-bold uppercase ${wineCardTheme.subText}`}>자동 감지 빈티지</span>
                      <span className="font-mono font-black text-xs">{analysisResult.vintage || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">구매 가격 <span className="text-gray-400 font-normal">(선택)</span></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-gray-500 font-medium text-xs">₩</span></div>
                    <input
                      type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="예: 35000"
                      className="pl-7 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl block p-2.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 ml-1">생산 연도 (Vintage)</label>
                  <div className="relative">
                    <input
                      type="text" value={vintage} onChange={(e) => setVintage(e.target.value)} placeholder="예: 2020 또는 NV"
                      className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl block p-2.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!analysisResult && !isAnalyzing && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
                <Icon name="Send" className="w-5 h-5 text-indigo-600" />보틀 라운지에 기록 즉시 공유하기
              </h3>
              <input
                type="checkbox"
                checked={shareToCommunity}
                onChange={(e) => setShareToCommunity(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 accent-indigo-600"
              />
            </div>
          </div>
        )}

        <div className={`transition-all duration-500 ${analysisResult ? 'opacity-100' : 'opacity-50 pointer-events-none hidden'}`}>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <span className="w-1.5 h-5 bg-indigo-600 rounded-full mr-2"></span> 1. 눈으로 보는 시각 관찰 (Visual)
            </h3>

            {selectedLiquorType === 'wine' && (
              <div className="mb-5 bg-slate-100 p-1 rounded-xl flex flex-wrap gap-1 border border-gray-200/50">
                <button type="button" onClick={() => { setWineStyle('red'); }} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${wineStyle === 'red' ? 'bg-white text-rose-800 shadow font-black' : 'text-gray-500'}`}>🔴 레드 와인</button>
                <button type="button" onClick={() => { setWineStyle('white'); }} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${wineStyle === 'white' ? 'bg-white text-yellow-700 shadow font-black' : 'text-gray-500'}`}>🟡 화이트 와인</button>
                <button type="button" onClick={() => { setWineStyle('sparkling'); }} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${wineStyle === 'sparkling' ? 'bg-white text-blue-900 shadow font-black' : 'text-gray-500'}`}>🍾 샴페인 / 기포</button>
                <button type="button" onClick={() => { setWineStyle('dessert'); }} className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${wineStyle === 'dessert' ? 'bg-white text-amber-600 shadow font-black' : 'text-gray-500'}`}>🍯 디저트</button>
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-xs font-black text-gray-400 mb-2">수색 / 색상 선택</label>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  let colors = ['보라색', '루비색', '가넷색', '벽돌색', '황갈색'];
                  if (selectedLiquorType === 'wine') {
                    if (wineStyle === 'white') {
                      colors = ['연녹색', '연노랑색', '짚색(Straw)', '진한 황금색', '호박색(Amber)'];
                    } else if (wineStyle === 'sparkling') {
                      colors = ['옅은 황금색', '구리빛 황금색', '분홍색(로제)'];
                    } else if (wineStyle === 'dessert') {
                      colors = ['진한 꿀색', '황금 호박색', '마호가니 갈색', '진한 오렌지빛'];
                    }
                  } else if (selectedLiquorType === 'whiskey') {
                    colors = ['맑은 호박색', '짙은 꿀색', '가넷색', '황금색'];
                  } else if (selectedLiquorType === 'sake') {
                    colors = ['무색 투명', '미황색(연한 노랑)', '불투명 화이트'];
                  } else if (selectedLiquorType === 'beer') {
                    colors = ['밝은 황금색', '구리빛 갈색', '검은색(포터)'];
                  }
                  return colors.map(color => (
                    <button key={color} type="button" onClick={() => setWineColor(color)} className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${wineColor === color ? 'bg-indigo-600 text-white shadow-sm scale-105' : 'bg-gray-50 text-gray-600 border border-gray-100'}`}>
                      {color}
                    </button>
                  ));
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2">투명도 (Clarity)</label>
                <select value={wineClarity} onChange={e => setWineClarity(e.target.value)} className="w-full text-xs font-black bg-gray-50 border border-gray-200 p-2.5 rounded-xl outline-none">
                  <option value="">투명도 선택</option>
                  <option value="맑음 (Brilliant)">맑음 (Brilliant)</option>
                  <option value="약간 맑음">약간 맑음</option>
                  <option value="약간 탁함">약간 탁함</option>
                  <option value="탁함 (Cloudy)">탁함 (Cloudy)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2">점도 / 눈물 (Viscosity)</label>
                <select value={wineViscosity} onChange={e => setWineViscosity(e.target.value)} className="w-full text-xs font-black bg-gray-50 border border-gray-200 p-2.5 rounded-xl outline-none">
                  <option value="">점도 선택</option>
                  <option value="가벼움 (낮음)">가벼움 (낮음)</option>
                  <option value="중간 (보통)">중간 (보통)</option>
                  <option value="무거움 / 진함">무거움 / 짙음 (높음)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center">
              <span className={`w-1.5 h-5 ${theme.bar} rounded-full mr-2`}></span> 2. 입에서 느껴지는 맛의 균형 (Palate)
            </h3>
            {activeConfig.criteria?.map(renderRatingBar)}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center">
              <span className="w-1.5 h-5 bg-emerald-600 rounded-full mr-2"></span> 3. 느껴지는 아로마 & 부케 (Aromas)
            </h3>
            <p className="text-xs text-gray-400 mb-4">코로 느낀 향들을 모두 골라 담아보세요.</p>
            <div className="space-y-3">
              {activeConfig.aromas?.map((cat) => (
                <div key={cat.category} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedAromaCategory(p => p === cat.category ? null : cat.category)} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="font-bold text-gray-700 text-xs">{cat.category}</span>
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
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <span className="w-1.5 h-5 bg-amber-600 rounded-full mr-2"></span> 4. 목 넘김 후 피니시 & 진화 (Finish)
            </h3>

            <div className="mb-4">
              <label className="block text-xs font-black text-gray-400 mb-2">여운의 길이 (Length)</label>
              <div className="grid grid-cols-3 gap-2">
                {['짧음 (<5초)', '중간 (5-10초)', '길고 깊음 (>10초)'].map(len => (
                  <button key={len} type="button" onClick={() => setFinishLength(len)} className={`py-2 rounded-xl text-xs font-black transition-all ${finishLength === len ? 'bg-amber-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 border border-gray-100'}`}>
                    {len}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-dashed border-gray-100">
              <label className="block text-xs font-black text-gray-400">시간 경과에 따른 변화 (Evolution)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] text-gray-500 mb-1">처음 오픈했을 때</span>
                  <select value={evolutionFirst} onChange={e => setEvolutionFirst(e.target.value)} className="w-full text-xs font-black bg-gray-50 border border-gray-200 p-2.5 rounded-xl outline-none">
                    <option value="">선택</option>
                    <option value="개방적">향이 개방적임</option>
                    <option value="닫힌 느낌">닫혀 있어서 밍밍함</option>
                  </select>
                </div>
                <div>
                  <span className="block text-[10px] text-gray-500 mb-1">시간이 갈수록 좋아졌나요?</span>
                  <div className="flex gap-2">
                    {['YES', 'NO'].map(yesno => (
                      <button key={yesno} type="button" onClick={() => setEvolutionBetter(yesno)} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${evolutionBetter === yesno ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 border border-gray-200'}`}>
                        {yesno}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-xs font-black text-gray-400 mb-1.5">추천 음식 페어링 (Food Pairing)</label>
              <input type="text" value={foodPairing} onChange={e => setFoodPairing(e.target.value)} placeholder="예: 양념 소갈비 구이, 짭조름한 치즈 플래터" className="w-full text-xs font-bold bg-gray-50 border border-gray-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
              <span className="w-1.5 h-5 bg-indigo-600 rounded-full mr-2"></span> 5. 종합 평가 & 오늘의 만족도 (100pt)
            </h3>

            <div className="mb-6 flex flex-col items-center bg-gray-50/50 py-5 rounded-2xl border border-gray-200/50">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-sm select-none">
                  <path d="M50,90 L50,112 M35,112 L65,112" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
                  <path d="M30,20 C25,65 30,90 50,90 C70,90 75,65 70,20 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
                  <g clipPath="url(#glass-clip)">
                    <rect 
                      x="20" 
                      y={90 - (overallRating100 * 0.7)} 
                      width="60" 
                      height="80" 
                      fill={
                        selectedLiquorType === 'wine' 
                          ? (wineStyle === 'white' ? '#fde047' : wineStyle === 'sparkling' ? '#fbbf24' : wineStyle === 'dessert' ? '#f59e0b' : '#991b1b') 
                          : selectedLiquorType === 'whiskey' ? '#b45309' 
                          : selectedLiquorType === 'sake' ? '#bae6fd' : '#eab308'
                      } 
                      className="transition-all duration-300"
                    />
                  </g>
                  <defs>
                    <clipPath id="glass-clip">
                      <path d="M30,20 C25,65 30,90 50,90 C70,90 75,65 70,20 Z" />
                    </clipPath>
                  </defs>
                </svg>

                <div className="absolute bottom-5 bg-white border border-slate-200 text-slate-800 font-mono font-black text-xs px-2.5 py-1 rounded-full shadow">
                  {overallRating100} 점
                </div>
              </div>

              <div className="w-4/5 mt-2">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={overallRating100} 
                  onChange={(e) => setOverallRating100(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none focus:ring-1" 
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-bold mt-1.5 px-0.5">
                  <span>0점 (최악)</span>
                  <span>50점 (보통)</span>
                  <span>100점 (명작)</span>
                </div>
              </div>
            </div>

            <textarea
              rows="3" value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)}
              placeholder="맛의 균형, 감지된 주요 특징, 동료들과 마신 날의 즐거운 추억을 편하게 한줄평으로 남겨주세요."
              className="w-full px-4 py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none text-sm font-semibold"
            />
          </div>

          <button onClick={handleSaveNote} disabled={isSaving}
            className={`w-full font-bold py-4 rounded-xl shadow-md transition-all flex items-center justify-center ${isSaving ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-black text-white active:scale-95'
              }`}>
            {isSaving ? <Icon name="Loader2" className="animate-spin w-5 h-5 mr-2" /> : null}
            {editingNoteId ? '테이스팅 수정 완료하기' : '노트 완벽 저장하기'}
          </button>
        </div>
      </div>
    );
  }

  function renderInsightsView() {
    const isTasteAnalysisEnabled = notes.length >= 5;

    return (
      <div className="space-y-5 animate-in fade-in duration-500">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-150 text-center">
          <Icon name="BarChart3" className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold mb-2">나의 시음 취향 분석</h2>
          <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">
            지금까지 {notes.length}병을 기록하셨습니다.<br />
            5병 이상의 노트를 남겨주시면 제미나이 AI가 누적 지표를 종합 해독하여<br />
            유저님의 마리아주 궁합과 고도화된 선호 지표 보고서를 발급해 드립니다.
          </p>

          <div className="mt-5 pt-4 border-t border-dashed border-gray-100">
            <button
              onClick={handleAnalyzeTasteLocal}
              disabled={!isTasteAnalysisEnabled || isAnalyzingTaste}
              className={`w-full py-3.5 rounded-2xl text-xs font-black transition-all flex items-center justify-center shadow ${
                isTasteAnalysisEnabled 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
              }`}
            >
              {isAnalyzingTaste ? (
                <>
                  <Icon name="Loader2" className="w-4 h-4 animate-spin mr-1.5" /> AI가 시음 카드를 해독하는 중...
                </>
              ) : (
                `✨ 제미나이 AI 취향 분석 시작하기`
              )}
            </button>
            {!isTasteAnalysisEnabled && (
              <p className="text-[10px] text-rose-500 font-extrabold mt-2.5">
                ※ 분석 활성화를 위해 테이스팅 카드를 {5 - notes.length}병 더 채워보세요! (현재: {notes.length}/5병)
              </p>
            )}
          </div>
        </div>

        {tasteAnalysisResult && (
          <div className="bg-gradient-to-br from-indigo-900 to-slate-950 p-6 rounded-3xl text-white shadow-xl animate-in slide-in-from-bottom-5 duration-500 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
              <span className="text-lg">🌌</span>
              <h3 className="text-sm font-black tracking-tight text-indigo-200">Gemini AI Taste Intelligence Report</h3>
            </div>

            <div className="space-y-4 text-xs font-bold leading-relaxed">
              <div>
                <span className="text-[10px] uppercase text-indigo-300 block mb-1">🍷 종합 취향 요약</span>
                <p className="text-white text-xs bg-white/5 p-3 rounded-xl border border-white/5">{tasteAnalysisResult.summary}</p>
              </div>

              <div>
                <span className="text-[10px] uppercase text-emerald-