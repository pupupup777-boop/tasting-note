import React, { useState, useRef, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

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

// Safe app UID binding
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'wine-tasting-app';
const appId = rawAppId.replace(/\//g, '_');

// VITE env standard binding with dynamic fallback
const GEMINI_API_KEY = (() => {
  try {
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch (e) {
    return "";
  }
})();

const isApiKeyMissing = !GEMINI_API_KEY || GEMINI_API_KEY.trim() === "";

const LIQUOR_CONFIG = {
  wine: {
    id: 'wine', name: '와인', icon: '🍷', theme: 'rose',
    aromas: [
      { category: '과일', items: ['레드베리', '블랙베리', '체리', '플럼', '사과', '배', '복숭아', '레몬', '자몽', '열대과일'] },
      { category: '꽃/식물', items: ['장미', '제비꽃', '허브', '풀잎', '피망', '유칼립투스', '민트'] },
      { category: '향신료/오크', items: ['바닐라', '정향', '후추', '시나몬', '토스트', '초콜릿', '커피', '가죽', '담배'] },
      { category: '기타', items: ['버섯', '흙', '트러플', '미네랄', '꿀', '버터', '효모'] }
    ],
    criteria: [
      { id: 'sweetness', label: '당도', minLabel: 'Dry', maxLabel: 'Sweet' },
      { id: 'acidity', label: '산도', minLabel: 'Low', maxLabel: 'High' },
      { id: 'tannin', label: '타닌', minLabel: 'Low', maxLabel: 'High' },
      { id: 'body', label: '바디감', minLabel: 'Light', maxLabel: 'Full' },
    ]
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
    BarChart3: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M18 17V9M13 17V5M8 17v-7" />
  };
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {icons[name] || <circle cx="12" cy="12" r="10" strokeWidth="2" />}
    </svg>
  );
};

const formatTimeAgo = (timestamp) => { if (!timestamp) return ''; const diff = Date.now() - timestamp; const seconds = Math.floor(diff / 1000); if (seconds < 60) return '방금 전'; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}분 전`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}시간 전`; const days = Math.floor(hours / 24); if (days < 7) return `${days}일 전`; const date = new Date(timestamp); return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`; };

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
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {
        console.error("Markdown JSON block parsing fail:", e2);
      }
    }
    const cleanText = text.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(cleanText);
    } catch (e3) {
      console.error("Strict text stripping fail:", e3);
      return null;
    }
  }
};

const FractionalStarRating = ({ value, onChange, onSave }) => {
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

export default function TastingApp() {
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [currentView, setCurrentView] = useState('community'); // default to lounge community
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Community & Profiles
  const [userProfile, setUserProfile] = useState({ nickname: '', badge: '🥚 알콜 입문자' });
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityFilter, setCommunityFilter] = useState('all');
  const [communitySort, setCommunitySort] = useState('latest');
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [commentInputs, setCommentInputs] = useState({});
  const [replyInputs, setReplyInputs] = useState({});
  const [activeReplyBox, setActiveReplyBox] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // 리액트 훅의 규칙 엄수: 서브 탭 상태 변수
  const [subTab, setSubTab] = useState('lounge');
  const [isCommunityModal, setIsCommunityModal] = useState(false);

  // Form State
  const [selectedLiquorType, setSelectedLiquorType] = useState('wine');
  // --- [1단계 패치] 신규 테이스팅 상세 입력용 State ---
  // 기존의 verificationCode 및 shareToCommunity 관련 중 일부는 유지하거나 단순화합니다.
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [selectedLiquorType, setSelectedLiquorType] = useState('wine');
  
  // 시각 관찰 (Visual) State
  const [wineColor, setWineColor] = useState(''); // 보라색, 루비색, 가넷색, 벽돌색, 황갈색 등
  const [wineColorTone, setWineColorTone] = useState(''); // 얕은, 중간, 짙은
  const [wineClarity, setWineClarity] = useState(''); // 맑음, 약간맑음, 약간탁함, 탁함
  const [wineViscosity, setWineViscosity] = useState(''); // 맑음(낮음), 약간맑음, 약간탁함, 탁함(높음)

  // 후각 관찰 (Smell stages) Intensity
  const [aromaIntensity, setAromaIntensity] = useState('중간'); // 약함, 중간, 강함

  // 여운 및 변화 (Finish & Evolution)
  const [finishLength, setFinishLength] = useState(''); // 짧음(<5초), 중간(5~10초), 긴(>10초)
  const [evolutionFirst, setEvolutionFirst] = useState(''); // 개방적, 닫힌 느낌
  const [evolutionTime, setEvolutionTime] = useState(''); // 향이 열림, 균형감 변화
  const [evolutionBetter, setEvolutionBetter] = useState(''); // YES, NO
  const [foodPairing, setFoodPairing] = useState(''); // 음식 페어링 아이디어
  
  const [image, setImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
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
  const [openComments, setOpenComments] = useState({});
  const [showRankModal, setShowRankModal] = useState(false);

  // Search Grounding
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
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

      const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'info');
      onSnapshot(profileRef, (profileSnap) => {
        if (profileSnap.exists()) {
          setUserProfile((p) => ({ ...p, ...profileSnap.data() }));
        } else {
          const randomNickname = '테이스터_' + Math.floor(1000 + Math.random() * 9000);
          setDoc(profileRef, { nickname: randomNickname, createdAt: Date.now() });
          setUserProfile((p) => ({ ...p, nickname: randomNickname }));
        }
      });
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const publicRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
    const unsubscribe = onSnapshot(query(publicRef), (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setCommunityPosts(data);
    });
    return () => unsubscribe();
  }, [user]);

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

  const handleGoogleLogin = async () => {
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
      const { getDocs } = await import('firebase/firestore');
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

  const handleSearchLiquor = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResult(null);

    let correctedName = searchQuery;

    // [1단계] 초고속 오타 교정 및 기본 백과 정보 가져오기 (이 단계는 구글 검색이 없으므로 JSON 모드 사용 가능)
    try {
      const basicPayload = {
        contents: [{
          role: "user",
          parts: [{
            text: `"${searchQuery}" 술의 한글/영문 공식 명칭, 역사와 특징 요약(1~2줄), 그리고 주요 테이스팅 노트(아로마, 팔레트, 피니시)를 아래 지정된 JSON 규격으로 알려줘. 
            중요: 키보드 오타 혹은 한영 변환 오타(예: qkfqpsl12년 -> 발베니 12년)가 있는 경우에도 반드시 가장 유력한 정상 한글 술 이름으로 완벽히 복원해서 "name" 필드에 채워주세요. 다른 설명 없이 오직 JSON만 반환해야 해.
            {
              "name": "술 공식 명칭",
              "summary": "역사 및 특징 요약",
              "tasting": "아로마, 팔레트, 피니시 특징"
            }`
          }]
        }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const basicResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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

    // [2단계] 국내 '네이버 쇼핑 가격비교' 및 '데일리샷' 타겟 초고속 정밀 검색 (재시도 2회로 축소 및 대기시간 단축)
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
          tools: [{ "google_search": {} }] // 실시간 구글 웹검색 연동
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000); // 응답 지연 시 9초 후 중단(앱 중단 방지)

        const priceResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
          
          if (candidate.groundingMetadata?.groundingAttributions) {
            groundings = candidate.groundingMetadata.groundingAttributions
              .map(attr => ({ uri: attr.web?.uri, title: attr.web?.title }))
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
          break; // 성공 시 루프 탈출
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
  const triggerFileInput = () => fileInputRef.current?.click();

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      // 너비를 300으로 조정하고 용량을 극적으로 줄여 Vercel/Gemini 타임아웃을 원천 차단합니다.
      const compressed = await compressImage(reader.result, 300);
      setImage(compressed);
      analyzeLabel(compressed);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const analyzeLabel = async (base64Image) => {
    setIsAnalyzing(true);
    setError(null);
    const base64Data = base64Image.split(',')[1];
    const config = LIQUOR_CONFIG[selectedLiquorType];

    const payload = {
      contents: [{
        role: "user",
        parts: [
          {
            text: `주류 라벨 이미지 분석 및 실물인증코드 감지 요청.
            현재 선택한 주종 카테고리는 '${config.name}'입니다.
            
            반드시 아래 지정된 마크다운 없는 순수 JSON 양식에만 정확히 맞춰서 응답해 주세요. 다른 설명글이나 머리말은 일절 배제하세요:
            {
              "name": "추출된 주류의 정확한 한글 및 영문 명칭",
              "type": "상세 품종 및 분류 정보",
              "region": "생산 국가 및 정밀 상세 지역",
              "vintage": "빈티지 연도 또는 숙성 년수 (없으면 '정보없음')",
              "detectedCategory": "실제 주종에 맞춰 'wine', 'whiskey', 'sake', 'beer' 중 하나 선택",
              "isCodeDetected": 사진 속에 수기나 쪽지로 적힌 '${verificationCode}' 코드가 또렷이 보인다면 true, 아니면 false (불리언 값으로 입력)"
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

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Gemini 에러 리포트: ${response.status} - ${errText}`);
          throw new Error(`API failed with status ${response.status}`);
        }

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

            if (shareToCommunity) {
              if (parsed.isCodeDetected) {
                showToast("실물 인증코드가 성공적으로 감지되었습니다!", "success");
              } else {
                showToast("쪽지 코드를 감지하지 못해 '집단지성 인증 투표'로 등록됩니다.", "info");
              }
            }
            setIsAnalyzing(false);
            return; // 성공 시 마감
          }
        }
        throw new Error("Invalid response format");
      } catch (err) {
        console.error("라벨 분석 트라이 횟수 실패 로그:", err);
        if (i === maxRetries - 1) {
          setError("네트워크 지연 또는 용량 제한으로 분석이 지연되었습니다. 수기 작성을 진행하셔도 좋습니다.");
          showToast("라벨 분석 네트워크 타임아웃", "error");
          setIsAnalyzing(false);
        } else {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
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

      let verificationStatus = 'ai_verified';
      if (shareToCommunity) {
        verificationStatus = analysisResult.isCodeDetected ? 'ai_verified' : 'pending_vote';
      }

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

      const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
      await addDoc(notesRef, newNote);

      if (shareToCommunity) {
        const communityRef = collection(db, 'artifacts', appId, 'public', 'data', 'community_posts');
        await addDoc(communityRef, {
          ...newNote,
          userId: user.uid,
          userName: userProfile.nickname,
          totalCommunityScore: 0,
          ratings: { [user.uid]: overallRating },
          originalRatings: ratings,
          comments: [],
          isVerified: verificationStatus === 'ai_verified',
          verificationStatus,
          verificationCodeUsed: verificationCode,
          votes: {
            voters: {},
            yesCount: 0,
            noCount: 0
          }
        });
      }

      showToast("테이스팅 노트가 안전하게 저장되었습니다!");
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
          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />

          {!image ? (
            <div onClick={triggerFileInput} className={`border-2 border-dashed ${theme.border} rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors group flex flex-col items-center justify-center h-48 bg-gray-50/50`}>
              <Icon name="Camera" className={`w-12 h-12 ${theme.text} opacity-50 mb-3`} />
              <p className={`font-medium ${theme.text}`}>라벨 사진 촬영</p>
              <p className="text-xs text-gray-400 mt-1">AI가 품종, 원재료 및 테마를 자동 감지합니다</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden shadow-inner border border-gray-200">
              <img src={image} alt="Label" className="w-full h-48 object-contain bg-gray-100" />
            </div>
          )}

          {isAnalyzing && (
            <div className="mt-4 flex flex-col items-center justify-center p-4 bg-gray-50 text-gray-800 rounded-xl border">
              <Icon name="Loader2" className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm font-medium">AI가 라벨 및 실물인증코드를 대조 해독 중입니다...</p>
            </div>
          )}
          {error && <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100">{error}</div>}

          {analysisResult && !isAnalyzing && (
            <div className="mt-6 space-y-4">
              <div className={`bg-gradient-to-br ${theme.gradient} text-white rounded-xl p-5 shadow-md relative overflow-hidden`}>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-lg font-bold leading-tight pr-2">{analysisResult.name}</h2>
                    <span className="px-2 py-1 bg-white/20 rounded text-xs font-medium backdrop-blur-sm">{analysisResult.type}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-white/85">
                    <div><span className="block text-white/50 text-xs mb-0.5">지역/국가</span><span className="font-medium text-white truncate block">{analysisResult.region || '-'}</span></div>
                    <div><span className="block text-white/50 text-xs mb-0.5">숙성/빈티지</span><span className="font-medium text-white">{analysisResult.vintage || '-'}</span></div>
                  </div>
                </div>
              </div>

              {shareToCommunity && (
                <div className={`p-4 rounded-xl border animate-in slide-in-from-top-4 ${analysisResult.isCodeDetected ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-amber-50/70 border-amber-200 text-amber-950'}`}>
                  <div className="flex items-start gap-2.5">
                    <Icon name={analysisResult.isCodeDetected ? "ShieldCheck" : "Info"} className={`${analysisResult.isCodeDetected ? 'text-emerald-600' : 'text-amber-600'} w-5 h-5 shrink-0 mt-0.5`} />
                    <div>
                      <h4 className="font-bold text-xs">
                        {analysisResult.isCodeDetected ? "✅ 실물 인증코드 매칭 성공!" : "⚠️ 실물 인증코드 인식 실패"}
                      </h4>
                      <p className="text-[11px] mt-1 leading-relaxed text-gray-700">
                        {analysisResult.isCodeDetected
                          ? `사진 속에서 발급한 코드 [${verificationCode}]가 감지되었습니다. 라운지에 인증완료 마크와 함께 안전하게 등록됩니다!`
                          : `코드 [${verificationCode}]를 사진에서 감지하지 못했습니다. 업로드 시 '집단지성 인증 투표' 상태로 등록됩니다.`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">구매 가격 <span className="text-gray-400 font-normal text-xs">(선택사항)</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-gray-500 font-medium">₩</span></div>
                  <input
                    type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="예: 35000"
                    className="pl-8 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl block p-3 outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {!analysisResult && !isAnalyzing && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
                <Icon name="Award" className="w-5 h-5 text-indigo-600" />보틀 라운지에 실물 인증하여 공유하기
              </h3>
              <input
                type="checkbox"
                checked={shareToCommunity}
                onChange={(e) => setShareToCommunity(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 accent-indigo-600"
              />
            </div>
            {shareToCommunity && (
              <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl animate-in slide-in-from-top-4">
                <p className="text-sm font-bold text-indigo-950">도용방지 실물인증코드 발급</p>
                <p className="text-xs text-indigo-800 mt-1 leading-relaxed">
                  위작 및 도용 방지를 위해 아래 발급된 코드를 종이에 크게 적어 **보틀과 함께 한 컷에 찍어** 촬영해 주세요!
                </p>
                <p className="text-base font-black text-indigo-700 bg-white mt-3 inline-block px-4 py-1.5 rounded shadow-inner border border-indigo-200 font-mono tracking-widest">{verificationCode}</p>
              </div>
            )}
          </div>
        )}

        <div className={`transition-all duration-500 ${analysisResult ? 'opacity-100' : 'opacity-50 pointer-events-none hidden'}`}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center">
              <span className={`w-1.5 h-5 ${theme.bar} rounded-full mr-2`}></span> 맛의 균형 (Palate)
            </h3>
            {config.criteria?.map(renderRatingBar)}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center">
              <span className="w-1.5 h-5 bg-emerald-600 rounded-full mr-2"></span> 느껴지는 아로마 & 부케 (Aromas)
            </h3>
            <p className="text-sm text-gray-400 mb-4">코로 느낀 향들을 모두 골라 담아보세요.</p>
            <div className="space-y-3">
              {config.aromas?.map((cat) => (
                <div key={cat.category} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedAromaCategory(p => p === cat.category ? null : cat.category)} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="font-medium text-gray-700 text-sm">{cat.category}</span>
                    {expandedAromaCategory === cat.category ? <Icon name="ChevronUp" className="w-4 h-4 text-gray-500" /> : <Icon name="ChevronDown" className="w-4 h-4 text-gray-500" />}
                  </button>
                  {expandedAromaCategory === cat.category && (
                    <div className="p-3 bg-white flex flex-wrap gap-1.5 border-t border-gray-100">
                      {cat.items.map(aroma => {
                        const isSelected = selectedAromas.includes(aroma);
                        return (
                          <button
                            key={aroma} onClick={() => setSelectedAromas(p => isSelected ? p.filter(a => a !== aroma) : [...p, aroma])}
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
              <span className="w-1.5 h-5 bg-indigo-600 rounded-full mr-2"></span> 종합 평가 & 오늘의 한줄평
            </h3>
            <div className="mb-6 flex flex-col items-center bg-gray-50 py-4 rounded-xl border border-gray-100">
              <label className="block text-sm font-bold text-gray-700 mb-3">전체 만족도 점수</label>
              <div className="flex space-x-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setOverallRating(star)} className="p-1 transition-transform hover:scale-110">
                    <Icon name="Star" className={`w-9 h-9 ${star <= overallRating ? 'fill-current text-yellow-400 drop-shadow-sm' : 'text-gray-300'}`} />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows="3" value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)}
              placeholder="친구들과 좋은시간 보냈습니다. 맛나겠쥬?"
              className="w-full px-4 py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none text-sm"
            />
          </div>

          <button onClick={handleSaveNote} disabled={isSaving || !overallRating}
            className={`w-full font-bold py-4 rounded-xl shadow-md transition-all flex items-center justify-center ${isSaving || !overallRating ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-black text-white active:scale-95'
              }`}>
            {isSaving ? <Icon name="Loader2" className="animate-spin w-5 h-5 mr-2" /> : null}
            노트 저장하기
          </button>
        </div>
      </div>
    );
  };

  const renderInsightsView = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center animate-in fade-in">
      <Icon name="BarChart3" className="w-12 h-12 text-indigo-300 mx-auto mb-3" />
      <h2 className="text-xl font-bold mb-2">나의 취향 분석</h2>
      <p className="text-gray-500 text-sm">지금까지 {notes.length}병을 기록하셨습니다!<br />데이터가 더 쌓이면 선호하는 품종 및 캐스크 선호도를 알려드릴게요.</p>
    </div>
  );

  const renderListView = () => (
    <div className="space-y-4 animate-in fade-in">
      <h2 className="text-xl font-bold">내 테이스팅 노트 ({notes.length})</h2>
      {notes.length === 0 && <div className="text-center p-10 bg-white rounded-2xl border text-gray-400">아직 작성한 보틀이 없습니다.</div>}
      {notes.map(note => {
        const conf = LIQUOR_CONFIG[note.liquorType] || LIQUOR_CONFIG.wine;
        const theme = getThemeClasses(conf.theme);
        return (
          <div key={note.id} onClick={() => { setSelectedDetailNote(note); setIsCommunityModal(false); }} className="bg-white p-4 rounded-xl shadow-sm border flex gap-4 hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99]">
            {note.thumbnail && <img src={note.thumbnail} className="w-20 h-20 bg-gray-100 rounded-lg object-cover" />}
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] px-2 py-0.5 rounded inline-block font-bold mb-1 uppercase ${theme.bg} ${theme.text}`}>{note.analysisResult?.type}</div>
              <h3 className="font-bold text-sm text-gray-900 truncate">{note.analysisResult?.name}</h3>
              <div className="flex items-center text-yellow-500 text-xs mt-1.5 font-bold"><Icon name="Star" className="w-3.5 h-3.5 fill-current text-yellow-500 mr-1" /> {note.overallRating}점</div>
            </div>
          </div>
        );
      })}
    </div>
  );

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
                        {isRatingLocked ? (
                          <div className="bg-amber-50 border border-amber-200 text-amber-800 font-black text-[11px] px-2.5 py-1.5 rounded-xl shadow-sm whitespace-nowrap">🔒 평가 완료 ({myRating.toFixed(1)}점)</div>
                        ) : (
                          <div className="shrink-0" onTouchMove={(e) => { if (!e.touches[0]) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.touches[0].clientX - rect.left; const percent = Math.min(Math.max(x / rect.width, 0), 1); const calculated = Math.round(percent * 5 * 2) / 2; handleRatePost(post.id, post.ratings, calculated); }}>
                            <FractionalStarRating value={myRating} onChange={(score) => handleRatePost(post.id, post.ratings, score)} />
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
            궁금한 보틀 이름을 검색해보세요.<br />AI가 최신 웹 검색을 통해 역사, 테이스팅 노트, 그리고 최근 시세(출처 및 성지 가격)를 명확하게 정밀 요약해 드립니다.
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

              <div className="grid grid-cols-2 gap-3 pt-2">
                {/* 1. 시중 평균 시세 상자 */}
                <div className="bg-blue-50/40 border border-blue-100/70 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <h4 className="flex items-center text-[11px] font-black text-blue-800 mb-1.5">
                      <Icon name="DollarSign" className="w-3.5 h-3.5 mr-1" /> 시중 평균 시세
                    </h4>
                    <div className="flex items-center gap-1.5 my-1">
                      {searchResult.avgPrice === "실시간 시세 파악 중..." && (
                        <Icon name="Loader2" className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                      )}
                      <p className="text-sm font-black text-gray-900 tracking-tight">{searchResult.avgPrice}</p>
                    </div>
                  </div>
                  {searchResult.avgPriceSource && searchResult.avgPriceSource !== "정보없음" && (
                    <p className="text-[9px] text-gray-400 font-bold mt-1.5 pt-1.5 border-t border-blue-100/30">
                      출처: {searchResult.avgPriceLink ? (
                        <a href={searchResult.avgPriceLink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5 font-black bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 transition-transform active:scale-95">
                          {searchResult.avgPriceSource} 🔗
                        </a>
                      ) : (
                        <span className="text-gray-500 font-medium">{searchResult.avgPriceSource}</span>
                      )}
                    </p>
                  )}
                </div>

                {/* 2. 최근 성지/최저가 정보 상자 */}
                <div className="bg-amber-50/40 border border-amber-100/70 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <h4 className="flex items-center text-[11px] font-black text-amber-800 mb-1.5">
                      <Icon name="MapPin" className="w-3.5 h-3.5 mr-1" /> 최근 성지/최저가 정보
                    </h4>
                    <div className="flex items-center gap-1.5 my-1">
                      {searchResult.bargainInfo === "최저가 정보 수집 중..." && (
                        <Icon name="Loader2" className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                      )}
                      <p className="text-sm font-black text-gray-900 tracking-tight">{searchResult.bargainInfo}</p>
                    </div>
                  </div>
                  {searchResult.bargainInfoSource && searchResult.bargainInfoSource !== "정보없음" && (
                    <p className="text-[9px] text-gray-400 font-bold mt-1.5 pt-1.5 border-t border-amber-100/30">
                      출처: {searchResult.bargainInfoLink ? (
                        <a href={searchResult.bargainInfoLink} target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:underline inline-flex items-center gap-0.5 font-black bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 transition-transform active:scale-95">
                          {searchResult.bargainInfoSource} 🔗
                        </a>
                      ) : (
                        <span className="text-gray-500 font-medium">{searchResult.bargainInfoSource}</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* [신규 하이엔드 인스펙터] 구글 검색 참조 실거래 웹 사이트 URL 직접 연동 배지 */}
              {searchResult.sources && searchResult.sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <h5 className="text-[11px] font-bold text-gray-400 mb-2 flex items-center gap-1.5">
                    <Icon name="ShieldCheck" className="w-3.5 h-3.5 text-emerald-500" /> 실시간 실거래 검색 참조 링크
                  </h5>
                  <div className="flex flex-wrap gap-1.5">
                    {searchResult.sources.slice(0, 3).map((src, idx) => (
                      <a
                        key={idx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg border border-indigo-100 font-semibold max-w-full truncate block transition-all hover:scale-[1.02]"
                      >
                        🔗 {src.title || "참조 실거래 사이트"}
                      </a>
                    ))}
                  </div>
                </div>
              )}

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
                <span className="text-[10px] bg-indigo-50 text-indigo-800 font-bold px-2 py-0.5 rounded uppercase border border-indigo-100">{selectedDetailNote.analysisResult?.type || '주류'}</span>
                <h3 className="font-black text-xl text-gray-900 mt-1">{selectedDetailNote.analysisResult?.name}</h3>
              </div>
              <button onClick={() => setSelectedDetailNote(null)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"><Icon name="X" className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">📊 테이스팅 오각형 밸런스 지표</h4>
              {selectedDetailNote.originalRatings || selectedDetailNote.ratings ? Object.entries(selectedDetailNote.originalRatings || selectedDetailNote.ratings).map(([key, val]) => { if (typeof val === 'object' || !['sweetness', 'acidity', 'tannin', 'body', 'peat', 'spicy', 'finish'].includes(key)) return null; return (<div key={key} className="flex justify-between text-xs font-bold py-1.5 border-b border-gray-200/50 last:border-0"> <span className="text-gray-600">{key === 'sweetness' ? '당도' : key === 'acidity' ? '산도' : key === 'tannin' ? '타닌' : key === 'body' ? '바디감' : key === 'peat' ? '피트향' : key === 'spicy' ? '스파이시' : key === 'finish' ? '피니시' : key.toUpperCase()}</span> <span className="text-indigo-600 bg-white px-2 py-0.5 rounded border shadow-inner">★ {val} / 5</span> </div>); }) : <p className="text-xs text-gray-400 text-center py-2">기록된 세부 슬라이더 지표가 없습니다.</p>}
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
              <button onClick={() => setSelectedDetailNote(null)} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                <Icon name="X" className="w-4 h-4 text-gray-500" />
              </button>
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

              {selectedDetailNote.personalNotes && (
                <div className="text-sm text-gray-700 bg-slate-50 p-4 rounded-2xl border border-gray-100 font-medium leading-relaxed italic">
                  "{selectedDetailNote.personalNotes}"
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
                  {selectedDetailNote.ratings?.[user?.uid] > 0 && selectedDetailNote.comments?.some(c => c.userId === user?.uid) ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 font-black text-[10px] px-2.5 py-1 rounded-xl shadow-sm whitespace-nowrap">
                      🔒 평가 완료 ({(selectedDetailNote.ratings?.[user?.uid] || 0).toFixed(1)}점)
                    </div>
                  ) : (
                    <div className="shrink-0" onTouchMove={(e) => { if (!e.touches[0]) return; const rect = e.currentTarget.getBoundingClientRect(); const x = e.touches[0].clientX - rect.left; const percent = Math.min(Math.max(x / rect.width, 0), 1); const calculated = Math.round(percent * 5 * 2) / 2; handleRatePost(selectedDetailNote.id, selectedDetailNote.ratings, calculated); }}>
                      <FractionalStarRating value={selectedDetailNote.ratings?.[user?.uid] || 0} onChange={(score) => handleRatePost(selectedDetailNote.id, selectedDetailNote.ratings, score)} />
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
                          <div className="text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100 shadow-sm space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs shrink-0">{commenterStats.badge ? commenterStats.badge.split(' ')[0] : '🥚'}</span>
                              <span className="font-extrabold text-gray-800">{c.userName || '알콜러'}</span>
                              {commenterRating > 0 && <span className="text-[9px] text-amber-500 font-black shrink-0 ml-0.5">★ {commenterRating.toFixed(1)}</span>}
                              <span className="text-[9px] text-gray-400 font-medium ml-auto shrink-0">{formatTimeAgo(c.createdAt)}</span>
                            </div>
                            <p className="text-gray-600 font-medium mt-1 pl-0.5">{c.text}</p>
                            <div className="text-right">
                              <button onClick={() => setActiveReplyBox(activeReplyBox === c.id ? null : c.id)} className="text-[10px] font-bold text-indigo-600 hover:underline mt-1">
                                {activeReplyBox === c.id ? '취소' : '↳ 답글 달기'}
                              </button>
                            </div>
                          </div>

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