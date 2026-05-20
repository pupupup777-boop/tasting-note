import React, { useState, useRef, useEffect, useMemo } from 'react';

// Safe environment variable getter to prevent esbuild compilation target warnings
const getGeminiApiKey = () => {
  try {
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch (e) {
    return "";
  }
};

const GEMINI_API_KEY = getGeminiApiKey();
const isApiKeyMissing = !GEMINI_API_KEY || GEMINI_API_KEY.trim() === "";

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
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

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'wine-tasting-app';
const appId = rawAppId.replace(/\//g, '_');

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
    rose: { 
      bg: 'bg-rose-50/70', 
      text: 'text-rose-900', 
      border: 'border-rose-100', 
      btnBg: 'bg-rose-800 hover:bg-rose-900', 
      gradient: 'from-rose-950 to-indigo-950', 
      bar: 'bg-rose-800' 
    },
    amber: { 
      bg: 'bg-amber-50/70', 
      text: 'text-amber-950', 
      border: 'border-amber-100', 
      btnBg: 'bg-amber-800 hover:bg-amber-950', 
      gradient: 'from-amber-950 to-amber-900', 
      bar: 'bg-amber-800' 
    },
    blue: { 
      bg: 'bg-slate-100/70', 
      text: 'text-slate-900', 
      border: 'border-slate-200', 
      btnBg: 'bg-slate-800 hover:bg-slate-900', 
      gradient: 'from-slate-900 to-indigo-950', 
      bar: 'bg-slate-800' 
    },
    yellow: { 
      bg: 'bg-amber-50/40', 
      text: 'text-yellow-950', 
      border: 'border-amber-200/50', 
      btnBg: 'bg-yellow-700 hover:bg-yellow-850', 
      gradient: 'from-yellow-950 to-amber-950', 
      bar: 'bg-yellow-600' 
    }
  };
  return map[theme] || map.rose;
};

const resizeImage = (base64Str, maxWidth = 400) => {
  return new Promise((resolve) => {
    try {
      let img = new Image();
      img.onload = () => {
        try {
          let canvas = document.createElement('canvas');
          const width = img.width || 1;
          const height = img.height || 1;
          let ratio = maxWidth / width;
          if (ratio > 1) ratio = 1;
          
          canvas.width = width * ratio;
          canvas.height = height * ratio;
          
          let ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
          } else {
            resolve(base64Str);
          }
        } catch (innerErr) {
          console.error("Canvas compression failed, bypassing", innerErr);
          resolve(base64Str);
        }
      };
      img.onerror = (err) => {
        console.error("Image loading crash, bypassing", err);
        resolve(base64Str);
      };
      img.src = base64Str;
    } catch (err) {
      console.error("Resizer initialization error, bypassing", err);
      resolve(base64Str);
    }
  });
};

const Icon = ({ name, className = "", ...props }) => {
  const hasSize = className.includes('w-') || className.includes('h-');
  const finalClass = `${hasSize ? '' : 'w-5 h-5'} ${className}`.trim();

  const icons = {
    Camera: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z" />,
    Upload: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />,
    ChevronRight: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />,
    Check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />,
    Loader2: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />,
    Wine: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l3.5 6h-7L12 2zm0 6v10m-4 0h8m-7 2h6" />,
    Star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.246.582 1.817l-3.97 2.885a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.885a1 1 0 00-1.18 0l-3.97 2.885c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118l-3.97-2.885c-.778-.571-.38-1.817.582-1.817h4.908a1 1 0 00.95-.69l1.519-4.674z" />,
    Info: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    ChevronDown: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />,
    ChevronUp: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />,
    Menu: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />,
    X: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
    List: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
    BarChart3: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
    PlusCircle: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    Search: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
    SortDesc: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />,
    DollarSign: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 16v1" />,
    Users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />,
    MessageSquare: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />,
    Heart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />,
    ShieldCheck: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
    Award: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L11 3z" />,
    Send: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />,
    Beer: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 10h-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v10a4 4 0 004 4h4a4 4 0 004-4v-2h2a2 2 0 002-2v-2a2 2 0 00-2-2z" />,
    Coffee: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 8h1a4 4 0 010 8h-1M2 8h14v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />,
    BookOpen: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
    MapPin: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />,
    Plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  };

  return (
    <svg 
      className={finalClass} 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24" 
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {icons[name] || <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />}
    </svg>
  );
};

const FractionalStarRatingComponent = ({ value, onChange, onSave }) => {
  const [hoverValue, setHoverValue] = useState(null);
  const containerRef = useRef(null);

  const handlePointerMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let x = e.clientX;
    if (e.touches && e.touches.length > 0) x = e.touches[0].clientX;
    const relativeX = Math.max(0, Math.min(x - rect.left, rect.width));
    let val = (relativeX / rect.width) * 5;
    val = Math.max(0.1, Math.round(val * 10) / 10);
    setHoverValue(val);
  };

  const handlePointerUp = () => {
    if (hoverValue !== null) {
      if (onChange) onChange(hoverValue);
      if (onSave) onSave(hoverValue);
      setHoverValue(null);
    }
  };

  const displayValue = hoverValue !== null ? hoverValue : value;

  return (
    <div className="flex flex-col items-center">
      <span className="text-xl font-black text-amber-500 mb-1">{displayValue.toFixed(1)}</span>
      <div
        ref={containerRef}
        className="flex space-x-1 cursor-pointer touch-none"
        onPointerDown={handlePointerMove}
        onPointerMove={(e) => { if (e.buttons > 0) handlePointerMove(e); }}
        onTouchMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
        onPointerLeave={() => setHoverValue(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fillPercentage = Math.max(0, Math.min(1, displayValue - (star - 1))) * 100;
          return (
            <div key={star} className="relative w-8 h-8 text-gray-300 drop-shadow-sm">
              <Icon name="Star" className="w-8 h-8 absolute top-0 left-0" />
              <div className="absolute top-0 left-0 overflow-hidden text-amber-400" style={{ width: `${fillPercentage}%` }}>
                <Icon name="Star" className="w-8 h-8 fill-current" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function TastingApp() {
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [currentView, setCurrentView] = useState('add');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Community & Profile States
  const [userProfile, setUserProfile] = useState({ nickname: '', badge: '🥚 알콜 입문자' });
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityFilter, setCommunityFilter] = useState('all');
  const [communitySort, setCommunitySort] = useState('latest');
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [commentInputs, setCommentInputs] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);

  // Add Form States
  const [selectedLiquorType, setSelectedLiquorType] = useState('wine');
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

  // Search/Encyclopedia States
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
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

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
      if (user && user.isAnonymous) {
         const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'info');
         const newNickname = 'Google유저_' + Math.floor(1000 + Math.random() * 9000);
         await setDoc(profileRef, { 
             nickname: newNickname, 
             createdAt: Date.now(),
             provider: 'google'
         }, { merge: true });
         
         setUserProfile(p => ({ ...p, nickname: newNickname }));
         const updatedUser = { ...user, isAnonymous: false, email: "user@gmail.com" };
         setUser(updatedUser); 
         
         setShowLoginModal(false);
         showToast("Google 계정으로 로그인 성공!", "success");
      }
    } catch (error) {
      console.error("Login error:", error);
      showToast("로그인 중 오류가 발생했습니다.", "error");
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
    
    try {
      const payload = {
        contents: [{ 
          role: "user", 
          parts: [{ text: `"${searchQuery}"에 대한 간략한 역사와 특징, 테이스팅 노트(향과 맛), 그리고 한국의 대표 주류 시세 비교 서비스(데일리샷 등)나 최근 실거래 커뮤니티 시세 가격 정보(날짜/구매처)를 최신 웹 검색 결과에 기반해 정제한 뒤 지정된 JSON 형태로 반환해줘.` }] 
        }],
        tools: [{ "google_search": {} }],
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "name": { type: "STRING", description: "검색된 정확한 술 한글/영문 이름" },
              "summary": { type: "STRING", description: "역사와 특징을 1~2줄로 압축한 요약 정보" },
              "tasting": { type: "STRING", description: "아로마, 팔레트, 피니시 주요 특징" },
              "avgPrice": { type: "STRING", description: "현재 형성된 평균적인 소매점/스마트오더 가격" },
              "bargainInfo": { type: "STRING", description: "최근 할인 행사 성지 가격 정보 (예: 26년 2월 이마트 24만원)" }
            },
            required: ["name", "summary", "tasting", "avgPrice", "bargainInfo"]
          }
        }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      });
      if (!response.ok) throw new Error(`API call failed: ${response.status}`);
      const result = await response.json();
      
      if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        setSearchResult(JSON.parse(result.candidates[0].content.parts[0].text));
      } else {
        showToast("검색 결과를 가져오지 못했습니다.", "error");
      }
    } catch (err) {
      showToast("검색 중 오류가 발생했습니다.", "error");
    } finally {
      setIsSearching(false);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressed = await resizeImage(reader.result, 400);
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
    const prompt = `주류 라벨 이미지 분석 및 실물인증코드 감지 요청.
    현재 선택한 주종 카테고리는 '${config.name}'입니다.
    
    [실물인증코드 OCR 검사]
    사진 속에 종이 쪽지나 포스트잇에 수작업으로 적은 인증코드 '${verificationCode}' 텍스트가 식별된다면 'isCodeDetected'를 true로, 보이지 않거나 오차가 있으면 false로 판별해주세요.
    
    [주종 자동 동기화 보정]
    만약 현재 업로드된 보틀이 와인인데 위스키로 잘못 선택된 경우처럼 실제 분석된 종류가 다를 경우, 'detectedCategory' 항목에 알맞은 올바른 주종 키값('wine', 'whiskey', 'sake', 'beer' 중 하나)을 자동으로 추론하여 지정해주세요.`;

    const payload = {
      contents: [{ role: "user", parts: [
        { text: prompt }, 
        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
      ]}],
      generationConfig: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "name": { type: "STRING", description: "주류의 정식 공식 명칭" },
            "type": { type: "STRING", description: "상세 종류/스타일분류" },
            "region": { type: "STRING", description: "생산지 국가 및 세부지역" },
            "vintage": { type: "STRING", description: "빈티지 년도 또는 숙성연수 정보 (없을 경우 null)" },
            "grape": { type: "STRING", description: "포도 품종, 사용 맥아, 주조미 쌀 품종, 캐스크 정보 등" },
            "producer": { type: "STRING", description: "양조장/증류소/제조업체 명칭" },
            "detectedCategory": { type: "STRING", description: "자동 판정 카테고리 ('wine', 'whiskey', 'sake', 'beer' 중 반드시 택일)" },
            "isCodeDetected": { type: "BOOLEAN", description: "이미지 내에서 정확한 인증코드 문자열 '${verificationCode}'가 인지/판독되었는지 여부" }
          },
          required: ["name", "type", "region", "vintage", "grape", "producer", "detectedCategory", "isCodeDetected"]
        }
      }
    };

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`API call failed: ${response.status}`);
      const result = await response.json();
      
      if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
        const parsed = JSON.parse(result.candidates[0].content.parts[0].text);
        setAnalysisResult(parsed);

        if (parsed.detectedCategory && parsed.detectedCategory !== selectedLiquorType) {
          if (LIQUOR_CONFIG[parsed.detectedCategory]) {
            setSelectedLiquorType(parsed.detectedCategory);
            showToast(`주종을 정확히 감지하여 자동으로 '${LIQUOR_CONFIG[parsed.detectedCategory].name}' 탭으로 변경했습니다!`, 'success');
          }
        }

        const activeCategory = parsed.detectedCategory || selectedLiquorType;
        const activeConfig = LIQUOR_CONFIG[activeCategory];
        
        const initialRatings = {};
        activeConfig.criteria.forEach(c => initialRatings[c.id] = 0);
        setRatings(initialRatings);
        setExpandedAromaCategory(activeConfig.aromas[0].category);

        if (shareToCommunity) {
          if (parsed.isCodeDetected) {
            showToast("실물 인증코드가 성공적으로 감지되었습니다! 즉시 정식인증 마크가 부여됩니다.", "success");
          } else {
            showToast("쪽지 코드를 감지하지 못했습니다. 업로드 시 '집단지성 인증 투표' 상태로 등록됩니다.", "info");
          }
        }
      } else {
        setError("AI가 이미지를 분석하지 못했습니다.");
      }
    } catch (err) {
      setError("라벨 정밀 분석 오류: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveNote = async () => {
    if (!analysisResult) {
      showToast("라벨 분석이 완료되지 않았습니다. 사진을 먼저 분석해 주세요.", "error");
      return;
    }
    
    if (!user) {
      showToast("로그인 정보를 가져오는 중입니다. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const smallImage = image ? await resizeImage(image, 300) : null;
      
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
          ratings: {}, 
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
    if (!user) return;
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postId);
    try {
      const postSnap = communityPosts.find(p => p.id === postId);
      if (!postSnap) return;

      const currentVotes = postSnap.votes || { voters: {}, yesCount: 0, noCount: 0 };
      const previousVote = currentVotes.voters?.[user.uid];

      if (previousVote === voteValue) return;

      const updatedVoters = { ...currentVotes.voters, [user.uid]: voteValue };
      
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
        votes: {
          voters: updatedVoters,
          yesCount,
          noCount
        },
        verificationStatus,
        isVerified: verificationStatus === 'community_verified' || verificationStatus === 'ai_verified'
      });

      showToast("인증 투표가 정직하게 집계되었습니다!", "success");
    } catch (err) {
      showToast("투표 처리 중 서버 오류가 발생했습니다.", "error");
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
      showToast(`${score}점을 부여했습니다!`);
    } catch (err) {
      showToast("평가 중 오류가 발생했습니다.", "error");
    }
  };

  const handleAddComment = async (postId) => {
    if (!user || !commentInputs[postId]?.trim()) return;
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'community_posts', postId);
    try {
      await updateDoc(postRef, {
        comments: arrayUnion({
          id: Date.now().toString() + Math.random(),
          userId: user.uid,
          userName: userProfile.nickname,
          text: commentInputs[postId].trim(),
          createdAt: Date.now()
        })
      });
      setCommentInputs(p => ({ ...p, [postId]: '' }));
    } catch (err) {
      showToast("댓글 작성에 실패했습니다.", "error");
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
  };

  const renderAddView = () => {
    const config = LIQUOR_CONFIG[selectedLiquorType];
    const theme = getThemeClasses(config.theme);

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Environment Variable Missing Alert Banner */}
        {isApiKeyMissing && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-950 rounded-2xl text-xs leading-relaxed">
            <h4 className="font-bold flex items-center gap-1.5 mb-1 text-amber-800">
              <Icon name="Info" className="w-4 h-4" /> VITE_GEMINI_API_KEY 보안 키 누락 안내
            </h4>
            현재 환경 변수에 VITE_GEMINI_API_KEY가 바인딩되지 않았습니다. 실물 보틀 라벨 정밀 분석과 시세 비교 백과사전을 이용하시려면 Vercel Settings {"->"} Environment Variables 탭에 사용자 본인의 구글 Gemini API Key를 등록한 뒤 Redeploy를 완료해 주세요!
          </div>
        )}

        {/* 주종 카테고리 선택 탭 */}
        {!analysisResult && !isAnalyzing && (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto whitespace-nowrap hide-scrollbar flex gap-2 snap-x snap-mandatory">
            {Object.values(LIQUOR_CONFIG).map(liquor => {
              const isSelected = selectedLiquorType === liquor.id;
              const lTheme = getThemeClasses(liquor.theme);
              return (
                <button
                  key={liquor.id}
                  onClick={() => { setSelectedLiquorType(liquor.id); resetForm(); }}
                  className={`snap-center shrink-0 px-5 py-3 rounded-2xl font-bold flex items-center transition-all ${
                    isSelected ? `${lTheme.btnBg} text-white shadow-md transform scale-105` : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-2 text-xl">{liquor.icon}</span> {liquor.name}
                </button>
              );
            })}
          </div>
        )}

        {/* 라벨 업로드/사진촬영 카드 */}
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
              <Icon name="Loader2" className="w-6 h-6 animate-spin mb-2 text-slate-500" />
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

              {/* 실물인증 검출 결과 피드백 배너 */}
              {shareToCommunity && (
                <div className={`p-4 rounded-xl border animate-in slide-in-from-top-4 ${analysisResult.isCodeDetected ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'}`}>
                  <div className="flex items-start gap-2.5">
                    <Icon name={analysisResult.isCodeDetected ? "ShieldCheck" : "Info"} className={`w-5 h-5 ${analysisResult.isCodeDetected ? 'text-emerald-600' : 'text-amber-600'} shrink-0 mt-0.5`} />
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

        {/* 실물인증코드 자랑하기 및 발급 */}
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
                 <p className="text-xs font-bold text-indigo-950">도용방지 실물인증코드 발급</p>
                 <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                   위작/인터넷 도용을 방지하기 위해 아래 발급된 코드를 종이에 적어 **보틀과 함께 한 컷에 찍어** 올려주세요! AI와 커뮤니티가 이 코드로 진짜 실물인지 크로스 체크합니다.
                 </p>
                 <p className="text-base font-black text-indigo-700 bg-white mt-3 inline-block px-4 py-1.5 rounded shadow-inner border border-indigo-200 font-mono tracking-widest">{verificationCode}</p>
               </div>
            )}
          </div>
        )}

        {}
        <div className={`transition-all duration-500 ${analysisResult ? 'opacity-100' : 'opacity-50 pointer-events-none hidden'}`}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-5 flex items-center">
              <span className={`w-1.5 h-5 ${theme.bar} rounded-full mr-2`}></span> 맛의 균형 (Palate)
            </h3>
            {config.criteria.map(renderRatingBar)}
          </div>

          {/* 아로마 다이어리 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center">
               <span className="w-1.5 h-5 bg-emerald-600 rounded-full mr-2"></span> 느껴지는 아로마 & 부케 (Aromas)
            </h3>
            <p className="text-sm text-gray-400 mb-4">코로 느낀 향들을 모두 골라 담아보세요.</p>
            <div className="space-y-3">
              {config.aromas.map((cat) => (
                <div key={cat.category} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedAromaCategory(p => p === cat.category ? null : cat.category)} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="font-medium text-gray-700 text-sm">{cat.category}</span>
                    <Icon name={expandedAromaCategory === cat.category ? "ChevronUp" : "ChevronDown"} className="w-4 h-4 text-gray-500" />
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
                            {isSelected && <Icon name="Check" className="w-3.5 h-3.5 inline mr-1" />} {aroma}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 종합적인 평가 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
             <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
               <span className="w-1.5 h-5 bg-indigo-600 rounded-full mr-2"></span> 종합 평가 & 오늘의 한줄평
            </h3>
            <div className="mb-6 flex flex-col items-center bg-gray-50 py-4 rounded-xl border border-gray-100">
              <label className="block text-sm font-bold text-gray-700 mb-3">전체 만족도 점수</label>
              <div className="flex space-x-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setOverallRating(star)} className="p-1 transition-transform hover:scale-110">
                    <Icon name="Star" className={`w-9 h-9 ${star <= overallRating ? 'fill-yellow-400 text-yellow-400 drop-shadow-sm' : 'text-gray-300'}`} />
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
            className={`w-full font-bold py-4 rounded-xl shadow-md transition-all flex items-center justify-center ${
              isSaving || !overallRating ? 'bg-gray-300 text-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-black text-white active:scale-95'
            }`}>
            {isSaving ? <Icon name="Loader2" className="animate-spin w-5 h-5 mr-2" /> : null}
            노트 저장하기
          </button>
        </div>
      </div>
    );
  };

  const renderListView = () => (
    <div className="space-y-4 animate-in fade-in">
       <h2 className="text-xl font-bold">내 테이스팅 노트 ({notes.length})</h2>
       {notes.length === 0 && <div className="text-center p-10 bg-white rounded-2xl border text-gray-400">아직 작성한 보틀이 없습니다.</div>}
       {notes.map(note => {
         const conf = LIQUOR_CONFIG[note.liquorType] || LIQUOR_CONFIG.wine;
         const theme = getThemeClasses(conf.theme);
         return (
           <div key={note.id} className="bg-white p-4 rounded-xl shadow-sm border flex gap-4 hover:shadow-md transition-shadow">
             {note.thumbnail && <img src={note.thumbnail} className="w-20 h-20 bg-gray-100 rounded-lg object-cover" />}
             <div className="flex-1 min-w-0">
                <div className={`text-[10px] px-2 py-0.5 rounded inline-block font-bold mb-1 uppercase ${theme.bg} ${theme.text}`}>{note.analysisResult?.type}</div>
                <h3 className="font-bold text-sm text-gray-900 truncate">{note.analysisResult?.name}</h3>
                <div className="flex items-center text-yellow-500 text-xs mt-1.5 font-bold"><Icon name="Star" className="w-3.5 h-3.5 fill-current mr-1 text-yellow-500" /> {note.overallRating}점</div>
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
      <div className="space-y-6 animate-in fade-in">
        <div className="bg-gradient-to-r from-gray-900 to-black rounded-2xl p-6 text-white shadow-md">
          <h2 className="text-xl font-bold flex items-center mb-2"><Icon name="Users" className="w-6 h-6 mr-2 text-gray-300" /> 보틀 라운지</h2>
          <div className="bg-white/10 rounded-lg px-3 py-2 text-sm font-medium border border-white/20 inline-block">
              내 칭호: <span className="text-yellow-400 font-bold">{userStats[user?.uid]?.badge || '🥚 알콜 입문자'}</span>
          </div>
        </div>

        <div className="flex justify-between items-center bg-white p-2 rounded-xl shadow-sm border border-gray-100">
           <div className="flex gap-2 overflow-x-auto hide-scrollbar snap-x flex-1">
             <button onClick={() => setCommunityFilter('all')} className={`px-4 py-1.5 rounded-full text-sm font-bold snap-start ${communityFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>전체</button>
             {Object.values(LIQUOR_CONFIG).map(l => (
               <button key={l.id} onClick={() => setCommunityFilter(l.id)} className={`px-4 py-1.5 rounded-full text-sm font-bold snap-start whitespace-nowrap ${communityFilter === l.id ? `${getThemeClasses(l.theme).btnBg} text-white` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l.icon} {l.name}</button>
             ))}
           </div>
           <select onChange={(e) => setCommunitySort(e.target.value)} className="text-xs bg-gray-50 border border-gray-200 rounded p-1.5 ml-2 outline-none cursor-pointer">
             <option value="latest">최신순</option>
             <option value="best">베스트</option>
           </select>
        </div>

        {displayedPosts.filter(p => communityFilter === 'all' || p.liquorType === communityFilter).map(post => {
          const authorStats = userStats[post.userId] || { badge: '🥚 알콜 입문자', isTop: false, rank: '-' };
          const myRating = post.ratings?.[user?.uid] || 0;
          const conf = LIQUOR_CONFIG[post.liquorType] || LIQUOR_CONFIG.wine;

          return (
            <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="p-4 flex items-center justify-between border-b border-gray-50 bg-gray-50/20">
                  <div className="flex items-center min-w-0">
                    <div className="flex items-center shrink-0">
                      <span className="text-base mr-1.5" title={authorStats.badge}>
                        {authorStats.isTop ? '🏆' : (authorStats.badge ? authorStats.badge.split(' ')[0] : '🥚')}
                      </span>
                      <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded-full font-bold mr-2">
                        {authorStats.rank}위
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-extrabold text-sm text-gray-900 truncate">{post.userName}</span>
                      
                      {myRating > 0 && (
                        <span className="bg-amber-50 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-200 flex items-center shrink-0 shadow-sm animate-in fade-in">
                          <Icon name="Star" className="w-3 h-3 fill-current text-amber-500 mr-1" />
                          내 평가: {myRating.toFixed(1)}점
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 ml-2">
                    {post.verificationStatus === 'ai_verified' && (
                      <span className="flex items-center bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-emerald-100">
                        <Icon name="Check" className="w-3 h-3 mr-1" /> AI인증
                      </span>
                    )}
                    {post.verificationStatus === 'community_verified' && (
                      <span className="flex items-center bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-blue-100">
                        <Icon name="Users" className="w-3 h-3 mr-1" /> 집단인증
                      </span>
                    )}
                    {post.verificationStatus === 'pending_vote' && (
                      <span className="flex items-center bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-amber-100 animate-pulse">
                        <Icon name="Search" className="w-3 h-3 mr-1" /> 인증투표중
                      </span>
                    )}
                  </div>
               </div>

               <div className="p-4">
                  <div className="flex gap-4 mb-4">
                    {post.thumbnail && (
                      <div className="w-24 h-24 bg-gray-100 rounded-lg border flex-shrink-0 relative overflow-hidden cursor-pointer" onClick={() => setSelectedImage(post.thumbnail)}>
                        <img src={post.thumbnail} alt="Post thumb" className="w-full h-full object-cover" />
                        <div className="absolute top-1 left-1 bg-black/50 text-white rounded w-6 h-6 flex items-center justify-center text-xs">{conf.icon}</div>
                      </div>
                    )}
                    <div>
                       <div className={`text-[10px] font-bold px-2 py-0.5 rounded mb-1 inline-block uppercase ${getThemeClasses(conf.theme).bg} ${getThemeClasses(conf.theme).text}`}>{post.analysisResult?.type || conf.name}</div>
                       <h3 className="font-bold text-gray-900 leading-tight mb-1">{post.analysisResult?.name || '이름 없음'}</h3>
                    </div>
                  </div>

                  {post.personalNotes && (
                     <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 font-medium leading-relaxed italic">"{post.personalNotes}"</div>
                  )}
               </div>

               {post.verificationStatus === 'pending_vote' && (
                 <div className="mx-4 mb-4 p-4 bg-amber-50/60 border border-amber-200/50 rounded-2xl">
                   <div className="flex items-start gap-2.5">
                     <Icon name="Info" className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                     <div className="flex-1">
                       <h4 className="text-xs font-black text-amber-950 mb-1">🙋‍♂️ 이 보틀, 직접 수기로 마신 인증인가요?</h4>
                       <p className="text-[11px] text-amber-900 leading-relaxed mb-3">
                         AI가 사진에서 코드를 찾지 못했습니다. 사진 확대 시 쪽지에 적힌 <b className="bg-white px-1.5 py-0.5 rounded border border-amber-300 font-mono text-[11px]">{post.verificationCodeUsed}</b> 코드가 보이신다면 투표해 주세요! (3명 이상 투표 및 동의율 50% 이상 시 실물인증 승격)
                       </p>
                       <div className="flex gap-2">
                         <button 
                           onClick={() => handleVoteVerification(post.id, 'yes')}
                           disabled={post.votes?.voters?.[user?.uid] === 'yes'}
                           className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                             post.votes?.voters?.[user?.uid] === 'yes'
                               ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                               : 'bg-white hover:bg-emerald-50 text-emerald-700 border border-gray-200 shadow-sm active:scale-95'
                           }`}
                         >
                           👍 보인다! ({post.votes?.yesCount || 0})
                         </button>
                         <button 
                           onClick={() => handleVoteVerification(post.id, 'no')}
                           disabled={post.votes?.voters?.[user?.uid] === 'no'}
                           className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                             post.votes?.voters?.[user?.uid] === 'no'
                               ? 'bg-rose-100 text-rose-800 border border-rose-200'
                               : 'bg-white hover:bg-rose-50 text-rose-600 border border-gray-200 shadow-sm active:scale-95'
                           }`}
                         >
                           👎 안 보인다 ({post.votes?.noCount || 0})
                         </button>
                       </div>
                     </div>
                   </div>
                 </div>
               )}

               <div className="px-4 py-4 border-t bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                   <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-gray-500 mb-2">이 술의 부러움 점수 평가 (드래그)</span>
                      {myRating > 0 ? (
                        <div className="flex flex-col items-center p-1.5 bg-white border rounded-2xl px-5 shadow-sm border-amber-200/60 text-amber-800 font-bold text-xs gap-1">
                          <span className="flex items-center gap-1">🔒 부러움 평가 완료 ({myRating.toFixed(1)}점)</span>
                        </div>
                      ) : (
                        <FractionalStarRatingComponent value={myRating} onSave={(score) => handleRatePost(post.id, post.ratings, score)} />
                      )}
                   </div>
                   <div className="flex items-center gap-4">
                       <div className="text-center">
                         <span className="text-[10px] font-bold text-gray-400">총 부러움</span>
                         <div className="text-lg font-black text-amber-600 flex items-center"><Icon name="Award" className="w-4 h-4 mr-1 text-amber-600" />{(post.totalCommunityScore || 0).toFixed(1)}</div>
                       </div>
                   </div>
               </div>

               <div className="p-4 border-t border-gray-100 bg-gray-50">
                  <div className="space-y-2 mb-3">
                    {(post.comments || []).map(c => (
                      <div key={c.id} className="text-sm"><span className="font-bold mr-2 text-gray-800">{c.userName}</span><span className="text-gray-600">{c.text}</span></div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={commentInputs[post.id] || ''} onChange={e => setCommentInputs(p => ({...p, [post.id]: e.target.value}))} placeholder="댓글을 남겨보세요..." className="flex-1 rounded-full border bg-white px-4 py-1.5 text-sm outline-none" />
                    <button onClick={() => handleAddComment(post.id)} className="bg-gray-800 hover:bg-black text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors"><Icon name="Send" className="w-3 h-3 ml-0.5 text-white" /></button>
                  </div>
               </div>
            </div>
          );
        })}
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
            궁금한 보틀 이름을 검색해보세요.<br/>AI가 최신 웹 검색을 통해 역사, 테이스팅 노트, 그리고 최근 시세(성지 가격)를 간략히 요약해 드립니다.
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
            {isSearching ? <Icon name="Loader2" className="w-5 h-5 animate-spin text-white" /> : <Icon name="Search" className="w-5 h-5 text-white" />}
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

              <div className="grid gap-3 pt-2">
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                  <h4 className="flex items-center text-xs font-bold text-blue-800 mb-1"><Icon name="DollarSign" className="w-4 h-4 mr-1 text-blue-800" /> 시중 평균 시세</h4>
                  <p className="text-sm font-medium text-gray-800">{searchResult.avgPrice}</p>
                </div>
                
                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl">
                  <h4 className="flex items-center text-xs font-bold text-amber-800 mb-1"><Icon name="MapPin" className="w-4 h-4 mr-1 text-amber-800" /> 최근 성지/할인 정보</h4>
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
          <button onClick={() => navigateTo('add')} className="text-sm font-bold bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full flex items-center transition-colors"><Icon name="PlusCircle" className="w-4 h-4 mr-1" /> 새 리뷰</button>
        </div>
      </header>

      {/* 메뉴 사이드바 */}
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

      {/* 이미지 전체화면 모달 (실물 도용 검증 확인용) */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
          <button onClick={() => setSelectedImage(null)} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/50 rounded-full backdrop-blur-sm transition-colors">
            <Icon name="X" className="w-6 h-6 text-white" />
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
    </div>
  );
}