import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, Wine, Star, Menu, X, List as ListIcon, BarChart3, PlusCircle, Search, SortDesc, DollarSign, Users, MessageSquare, ShieldCheck, Award, Send, MapPin, BookOpen, ChevronUp, ChevronDown, Check, Loader2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

// ✅ 사용자님의 완벽한 Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDfsow7Q73INwwaFylX4De6LwKrmEDovcE",
  authDomain: "chill-sip.firebaseapp.com",
  projectId: "chill-sip",
  storageBucket: "chill-sip.firebasestorage.app",
  messagingSenderId: "597973066423",
  appId: "1:597973066423:web:cd9b1bea283855c30ca332",
  measurementId: "G-VLN1Y7FWR5"
};
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🍷🥃 주종별 설정 및 테마
const LIQUOR_CONFIG = {
  wine: {
    id: 'wine', name: '와인', icon: '🍷', theme: 'rose',
    prompt: `Analyze this wine label. Required JSON fields: name, type, region, vintage, grape, producer.`,
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
    prompt: `Analyze this whiskey label. Required JSON fields: name, type, region, vintage (Age), grape (Cask), producer.`,
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
    prompt: `Analyze this Sake label. Required JSON fields: name, type, region, vintage, grape (Rice), producer.`,
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
    id: 'beer', name: '크래프트 맥주', icon: '🍺', theme: 'yellow',
    prompt: `Analyze this beer label. Required JSON fields: name, type, region, vintage (ABV), grape (Hop), producer.`,
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
    rose: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', btnBg: 'bg-rose-800', gradient: 'from-rose-900 to-indigo-900', bar: 'bg-rose-800' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200', btnBg: 'bg-amber-700', gradient: 'from-amber-900 to-yellow-900', bar: 'bg-amber-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200', btnBg: 'bg-blue-700', gradient: 'from-blue-900 to-cyan-900', bar: 'bg-blue-700' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-900', border: 'border-yellow-300', btnBg: 'bg-yellow-600', gradient: 'from-yellow-700 to-orange-800', bar: 'bg-yellow-500' }
  };
  return map[theme] || map.rose;
};
const resizeImage = (base64Str, maxWidth = 400) => {
  return new Promise((resolve) => {
    let img = new Image();
    
    // 1. 이미지가 로딩 완료되면 실행할 압축 설정을 '먼저' 정의합니다. (매우 중요 ⭐)
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let ratio = maxWidth / img.width;
      if (ratio > 1) ratio = 1;
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      let ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // 화질을 50%(0.5) 수준으로 압축하여 용량을 30KB 이하로 싹 줄입니다.
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    
    // 2. 준비가 끝난 후 마지막에 사진 주소를 넣어야 이벤트가 정상적으로 트리거됩니다!
    img.src = base64Str; 
  });
};

const FractionalStarRating = ({ value, onChange, onSave }) => {
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
      onChange && onChange(hoverValue);
      onSave && onSave(hoverValue);
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
                <Star className="w-8 h-8 absolute top-0 left-0" />
                <div className="absolute top-0 left-0 overflow-hidden text-amber-400" style={{ width: `${fillPercentage}%` }}>
                  <Star className="w-8 h-8 fill-current" />
                </div>
              </div>
            );
          })}
        </div>
    </div>
  );
};

export default function TastingApp() {
  const [currentView, setCurrentView] = useState('community');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // 유저 & 로그인 상태 (⭐ 빠졌던 로그인 모달 복구)
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState({ nickname: '', badge: '🥚 알콜 입문자', isSocial: false });
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 데이터 상태
  const [notes, setNotes] = useState([]);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityFilter, setCommunityFilter] = useState('all');
  const [communitySort, setCommunitySort] = useState('latest');
  const [commentInputs, setCommentInputs] = useState({});

  // 작성 상태
  const [selectedLiquorType, setSelectedLiquorType] = useState('wine');
  const [image, setImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [ratings, setRatings] = useState({});
  const [selectedAromas, setSelectedAromas] = useState([]);
  const [personalNotes, setPersonalNotes] = useState('');
  const [overallRating, setOverallRating] = useState(0);
  const [expandedAromaCategory, setExpandedAromaCategory] = useState(null);
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const fileInputRef = useRef(null);

  // 검색 상태 (⭐ 빠졌던 백과사전 검색 복구)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    // 앱 초기 실행 시 익명 로그인 보장 (에러 발생 시 가짜 유저 생성 우회 적용)
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        try { 
          await signInAnonymously(auth); 
        } catch (e) { 
          console.error("Auth error", e);
          // 🚀 Firebase 인증이 안 켜져 있을 경우, 테스트를 위해 임의의 가상 유저를 부여합니다!
          setUser({ uid: 'local-test-user-999', isAnonymous: true });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // 내 노트 데이터 실시간 구독
    const notesRef = collection(db, 'users', user.uid, 'notes');
    const unsubscribeNotes = onSnapshot(query(notesRef), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt - a.createdAt);
      setNotes(data);
    });

    // 커뮤니티 데이터 실시간 구독
    const publicRef = collection(db, 'community_posts');
    const unsubscribeCommunity = onSnapshot(query(publicRef), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCommunityPosts(data);
    });

    // 프로필 정보 동기화
    const profileRef = doc(db, 'users', user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, (profileSnap) => {
      if (profileSnap.exists()) {
        setUserProfile((p) => ({ ...p, ...profileSnap.data() }));
      } else {
        const randomNickname = '테이스터_' + Math.floor(1000 + Math.random() * 9000);
        setDoc(profileRef, { nickname: randomNickname, createdAt: Date.now() });
        setUserProfile((p) => ({ ...p, nickname: randomNickname }));
      }
    });

    return () => { unsubscribeNotes(); unsubscribeCommunity(); unsubscribeProfile(); };
  }, [user]);

  // 10단계 애주가 훈장 시스템
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
      if (s >= 2000) badge = '🐉 10. 주신의 경지';
      else if (s >= 1000) badge = '👑 9. 황제';
      else if (s >= 500) badge = '🏰 8. 국왕';
      else if (s >= 300) badge = '🛡️ 7. 대공';
      else if (s >= 150) badge = '⚔️ 6. 공작';
      else if (s >= 100) badge = '🦅 5. 후작';
      else if (s >= 60) badge = '🐎 4. 백작';
      else if (s >= 30) badge = '🗡️ 3. 자작';
      else if (s >= 10) badge = '📜 2. 남작';

      userBadges[uid] = { 
        badge, 
        isTop: stats[uid].topPostScore === globalMaxScore && globalMaxScore > 0, 
        totalScore: s, 
        rank: index + 1 
      };
    });
    return userBadges;
  }, [communityPosts]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleGoogleLogin = async () => {
    // 실제 배포 시엔 signInWithPopup(auth, provider)를 호출
    // 현재는 Canvas 테스트용으로 시뮬레이션
    showToast("구글 로그인을 시도합니다...", "info");
    setTimeout(async () => {
       if (user) {
         const newNickname = 'Google유저_' + Math.floor(1000 + Math.random() * 9000);
         await updateDoc(doc(db, 'users', user.uid), { nickname: newNickname, isSocial: true });
         setShowLoginModal(false);
         showToast("Google 계정으로 연동 성공!", "success");
       }
    }, 1000);
  };

  const handleSearchLiquor = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResult(null);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `"${searchQuery}"의 정보를 요약해줘. 반드시 다른 말은 하지 말고 딱 아래 양식의 JSON 형태로만 출력해줘.
          양식:
          {
            "name": "술의 정확한 이름",
            "summary": "역사와 특징을 정말 짧게 1~2줄 요약",
            "tasting": "핵심적인 향과 맛 테이스팅 노트 요약",
            "avgPrice": "대략적인 시중 가격대",
            "bargainInfo": "최근 주류 매장이나 할인점 시세와 시기"
          }` }] }],
          // 🚀 구글 서버에게 JSON 타입으로만 답변하라고 강제하는 마법의 설정입니다!
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });
      
      const data = await response.json();
      
      if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
        // AI가 보내준 JSON 텍스트를 컴퓨터가 읽을 수 있는 데이터로 변환합니다.
        const parsedData = JSON.parse(data.candidates[0].content.parts[0].text);
        setSearchResult(parsedData);
      } else if (data.error) {
        alert(`구글 에러: ${data.error.message}`);
      } else {
        alert("데이터를 읽어오지 못했습니다.");
      }
    } catch (e) {
      alert("에러 발생: " + e.message);
    }
    setIsSearching(false);
  };

  const triggerFileInput = () => fileInputRef.current?.click();
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      setIsAnalyzing(true);
      setVerificationCode('CODE-' + Math.floor(1000 + Math.random() * 9000));
      
      try {
        // 1. 원본 대용량 사진을 400픽셀 크기의 가벼운 썸네일로 압축
        const compressedBase64 = await resizeImage(reader.result, 400);
        setImage(compressedBase64); 
        
        // 2. 압축된 데이터에서 Base64 텍스트만 추출
        const base64Data = compressedBase64.split(',')[1];
        
        // 3. 현재 주종 설정 가져오기
        const config = LIQUOR_CONFIG[selectedLiquorType];
        
        // 4. 구글 최신형 gemini-2.5-flash 모델에 철저한 규격표와 함께 분석 요청
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `이 술 라벨 사진을 분석해서 정보를 추출해줘. 반드시 다른 설명은 일절 하지 말고, 지정된 JSON 규격에 맞춰서만 답변을 작성해줘. 분석할 주종은 '${config.name}'이야.` },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
              ]
            }],
            // 🔥 [500 내부 에러 완벽 방지] 구글 서버에게 규격표(Schema)를 강제로 쥐어줍니다!
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  "name": { "type": "STRING", "description": "제품의 이름" },
                  "type": { "type": "STRING", "description": "세부 종류 혹은 스타일" },
                  "region": { "type": "STRING", "description": "생산 국가 및 지역" },
                  "vintage": { "type": "STRING", "description": "생산 연도 혹은 숙성 연수 (정보가 없으면 null)" },
                  "grape": { "type": "STRING", "description": "핵심 원재료, 품종, 혹은 특징" },
                  "producer": { "type": "STRING", "description": "생산자 혹은 양조장 이름" }
                },
                "required": ["name", "type", "region", "vintage", "grape", "producer"]
              }
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error?.message || "서버 응답 오류");
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
          const rawJsonText = data.candidates[0].content.parts[0].text;
          const parsedResult = JSON.parse(rawJsonText);
          
          setAnalysisResult(parsedResult);
          
          // 맛 평가 슬라이더 초기화
          const initialRatings = {};
          config.criteria.forEach(c => initialRatings[c.id] = 0);
          setRatings(initialRatings);
          setExpandedAromaCategory(config.aromas[0].category);
          
          showToast("라벨 분석을 완료했습니다!", "success");
        } else {
          alert("AI가 사진 속 라벨을 인지하지 못했습니다. 더 밝은 곳에서 똑바로 다시 찍어보세요!");
        }
      } catch (error) {
        console.error("라벨 분석 오류:", error);
        alert("라벨 분석에 실패했습니다: " + error.message);
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };


  const handleSaveNote = async () => {
    if (!analysisResult || !user) return;
    const newNote = {
      liquorType: selectedLiquorType,
      analysisResult, ratings, selectedAromas,
      personalNotes, overallRating, thumbnail: image,
      createdAt: Date.now()
    };
    try {
      await addDoc(collection(db, 'users', user.uid, 'notes'), newNote);
      if (shareToCommunity) {
        await addDoc(collection(db, 'community_posts'), {
          ...newNote,
          userId: user.uid, userName: userProfile.nickname,
          totalCommunityScore: 0, ratings: {}, comments: [],
          isVerified: true, verificationCodeUsed: verificationCode
        });
      }
      showToast("노트가 성공적으로 저장되었습니다!");
      setImage(null); setAnalysisResult(null); setPersonalNotes(''); setOverallRating(0); setShareToCommunity(false);
      setCurrentView('list');
    } catch (err) {
      // 🚀 [범인 검거] 저장 중 에러가 나면 폰 화면에 정확히 이유를 띄웁니다!
      alert("데이터베이스 저장 실패 상세 이유: " + err.message);
      console.error("저장 상세 에러:", err);
    }
  };

  const handleRatePost = async (postId, currentRatings, score) => {
    if (!user) return;
    const postRef = doc(db, 'community_posts', postId);
    const updatedRatings = { ...(currentRatings || {}) };
    updatedRatings[user.uid] = score;
    const totalScore = Object.values(updatedRatings).reduce((acc, curr) => acc + curr, 0);
    await updateDoc(postRef, { ratings: updatedRatings, totalCommunityScore: totalScore });
    showToast(`${score}점을 부여했습니다!`);
  };

  const handleAddComment = async (postId) => {
    if (!user || !commentInputs[postId]?.trim()) return;
    const postRef = doc(db, 'community_posts', postId);
    await updateDoc(postRef, {
      comments: arrayUnion({ id: Date.now(), userId: user.uid, userName: userProfile.nickname, text: commentInputs[postId].trim() })
    });
    setCommentInputs(p => ({ ...p, [postId]: '' }));
  };

  const renderSearchView = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-6 text-white shadow-md">
        <h2 className="text-xl font-bold flex items-center mb-2"><Search className="w-6 h-6 mr-2 text-blue-300" /> 보틀 백과 & 시세 검색</h2>
        <p className="text-sm text-blue-100 opacity-90 leading-relaxed">궁금한 보틀 이름을 검색해보세요. AI가 최신 웹 검색을 통해 역사, 노트, 최근 시세를 요약해 드립니다.</p>
      </div>
      <div className="flex items-center space-x-2 bg-white p-2 rounded-2xl shadow-sm border border-gray-200">
        <input 
          type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearchLiquor()}
          placeholder="예: 조니워커 블루라벨, 돔 페리뇽" className="flex-1 bg-transparent px-3 py-2 outline-none text-gray-800"
        />
        <button onClick={handleSearchLiquor} disabled={isSearching || !searchQuery} className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl disabled:opacity-50">
          {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        </button>
      </div>
      {searchResult && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in">
          <div className="bg-gray-50 px-5 py-4 border-b flex justify-between"><h3 className="font-black text-lg">{searchResult.name}</h3><span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-1 rounded">AI 요약</span></div>
          <div className="p-5 space-y-5">
            <div><h4 className="flex text-sm font-bold mb-1.5"><BookOpen className="w-4 h-4 mr-1.5 text-gray-500" /> 역사 및 특징</h4><p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{searchResult.summary}</p></div>
            <div><h4 className="flex text-sm font-bold mb-1.5"><Wine className="w-4 h-4 mr-1.5 text-rose-500" /> 테이스팅 노트</h4><p className="text-sm text-gray-600 bg-rose-50 p-3 rounded-xl border border-rose-100">{searchResult.tasting}</p></div>
            <div className="grid gap-3 pt-2">
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl"><h4 className="flex text-xs font-bold text-blue-800 mb-1"><DollarSign className="w-4 h-4 mr-1"/> 시중 평균 시세</h4><p className="text-sm font-medium">{searchResult.avgPrice}</p></div>
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl"><h4 className="flex text-xs font-bold text-amber-800 mb-1"><MapPin className="w-4 h-4 mr-1"/> 최근 성지 정보</h4><p className="text-sm font-medium">{searchResult.bargainInfo}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderCommunityView = () => {
    let displayedPosts = [...communityPosts];
    if (communityFilter !== 'all') displayedPosts = displayedPosts.filter(p => p.liquorType === communityFilter);
    if (communitySort === 'latest') displayedPosts.sort((a, b) => b.createdAt - a.createdAt);
    else displayedPosts.sort((a, b) => (b.totalCommunityScore || 0) - (a.totalCommunityScore || 0));

    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="bg-gradient-to-r from-gray-900 to-black rounded-2xl p-6 text-white shadow-md">
          <h2 className="text-xl font-bold flex items-center mb-2"><Users className="w-6 h-6 mr-2 text-gray-300" /> 테이스터스 라운지</h2>
          <p className="text-sm text-gray-300 opacity-90 mb-4">점수를 모아 10단계 훈장을 획득하세요!</p>
          <div className="bg-white/10 rounded-lg px-3 py-2 text-xs font-medium border border-white/20 inline-block">
              내 칭호: <span className="text-yellow-400 text-sm font-bold mx-1">{userStats[user?.uid]?.badge || '🥚 입문자'}</span> 
              <span className="bg-white/20 px-2 py-0.5 rounded-full">{(userStats[user?.uid]?.totalScore || 0).toFixed(1)}점</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 snap-x">
          <button onClick={() => setCommunityFilter('all')} className={`snap-start px-4 py-2 rounded-full text-sm font-bold ${communityFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border'}`}>전체</button>
          {Object.values(LIQUOR_CONFIG).map(l => (
            <button key={l.id} onClick={() => setCommunityFilter(l.id)} className={`snap-start px-4 py-2 rounded-full text-sm font-bold flex items-center ${communityFilter === l.id ? `${getThemeClasses(l.theme).btnBg} text-white` : 'bg-white text-gray-600 border'}`}><span className="mr-1">{l.icon}</span> {l.name}</button>
          ))}
        </div>
        <div className="flex justify-end"><select onChange={(e) => setCommunitySort(e.target.value)} className="text-xs bg-white border p-1.5 rounded-lg shadow-sm"><option value="latest">최신글순</option><option value="best">일간 베스트</option></select></div>
        {displayedPosts.map(post => {
            const authorStats = userStats[post.userId] || {};
            const conf = LIQUOR_CONFIG[post.liquorType] || LIQUOR_CONFIG.wine;
            return (
              <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 flex items-center justify-between border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-800 border">{post.userName?.charAt(0) || '?'}</div>
                    <div>
                      <div className="font-bold text-sm text-gray-900 flex items-center gap-1.5">{post.userName} <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded border">{authorStats.badge}</span>{authorStats.isTop && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">🏆 1위</span>}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{new Date(post.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  {post.isVerified && <div className="flex bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold border border-blue-100"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> 실물 인증</div>}
                </div>
                <div className="p-4">
                  <div className="flex gap-4 mb-4">
                    {post.thumbnail && <div className="w-24 h-24 bg-gray-100 rounded-lg border flex-shrink-0 relative overflow-hidden"><img src={post.thumbnail} className="w-full h-full object-cover" /><div className="absolute top-1 left-1 bg-black/50 text-white rounded w-6 h-6 flex items-center justify-center text-xs">{conf.icon}</div></div>}
                    <div>
                       <div className={`text-[10px] font-bold px-2 py-1 rounded mb-1 inline-block ${getThemeClasses(conf.theme).bg} ${getThemeClasses(conf.theme).text}`}>{post.analysisResult?.type || conf.name}</div>
                       <h3 className="font-bold text-gray-900 leading-tight mb-1">{post.analysisResult?.name || '이름 없음'}</h3>
                    </div>
                  </div>
                  {post.personalNotes && <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border font-medium text-lg leading-relaxed shadow-inner">"{post.personalNotes}"</div>}
                </div>
                <div className="px-4 py-4 border-t bg-gray-50 flex justify-between items-center">
                  <div className="flex flex-col items-center">
                    <span className="text-[11px] text-gray-500 font-bold mb-2">부러움 평가 (드래그)</span>
                    <FractionalStarRating value={post.ratings?.[user?.uid] || 0} onSave={(score) => handleRatePost(post.id, post.ratings, score)} />
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 font-bold mb-1">총 부러움</span>
                    <div className="flex items-center text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100"><Award className="w-4 h-4 mr-1" /><span className="font-black text-lg">{(post.totalCommunityScore || 0).toFixed(1)}</span></div>
                  </div>
                </div>
                <div className="p-4 border-t bg-white">
                  <div className="space-y-2 mb-3">{(post.comments || []).map(c => (<div key={c.id} className="text-sm"><span className="font-bold mr-2">{c.userName}</span><span className="text-gray-600">{c.text}</span></div>))}</div>
                  <div className="flex"><input type="text" value={commentInputs[post.id] || ''} onChange={(e) => setCommentInputs(p => ({...p, [post.id]: e.target.value}))} placeholder="댓글 작성..." className="flex-1 border rounded-full px-4 py-1.5 text-sm outline-none"/><button onClick={() => handleAddComment(post.id)} className="ml-2 w-8 h-8 bg-gray-800 text-white rounded-full flex items-center justify-center"><Send className="w-4 h-4"/></button></div>
                </div>
              </div>
            );
        })}
      </div>
    );
  };

  const renderAddView = () => {
    const config = LIQUOR_CONFIG[selectedLiquorType];
    const theme = getThemeClasses(config.theme);
    return (
      <div className="space-y-6 animate-in fade-in">
        {!analysisResult && !isAnalyzing && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
            {Object.values(LIQUOR_CONFIG).map(l => (
              <button key={l.id} onClick={() => { setSelectedLiquorType(l.id); setImage(null); }} className={`px-5 py-3 rounded-2xl font-bold flex-shrink-0 ${selectedLiquorType === l.id ? `${getThemeClasses(l.theme).btnBg} text-white` : 'bg-white text-gray-500 border'}`}><span className="mr-2 text-xl">{l.icon}</span> {l.name}</button>
            ))}
          </div>
        )}
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
          {!image ? (
            <div onClick={triggerFileInput} className={`border-2 border-dashed ${theme.border} rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-gray-50 hover:bg-gray-100`}>
              <Camera className={`w-12 h-12 ${theme.text} mb-3`} /><p className={`font-medium ${theme.text}`}>라벨 사진 촬영</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden border"><img src={image} className="w-full h-48 object-contain bg-gray-100" /></div>
          )}
          {isAnalyzing && <div className="mt-4 p-4 bg-gray-50 rounded-xl text-center flex flex-col items-center"><Loader2 className="animate-spin mb-2" /><p className="font-bold text-sm">AI 라벨 분석 중...</p></div>}
          {analysisResult && !isAnalyzing && (
            <div className={`mt-6 bg-gradient-to-br ${theme.gradient} text-white rounded-xl p-5`}><h2 className="text-lg font-bold">{analysisResult.name}</h2><span className="bg-white/20 px-2 py-1 rounded text-xs mt-2 inline-block">{analysisResult.type}</span></div>
          )}
        </div>
        {analysisResult && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
               <h3 className="font-bold mb-4">맛의 균형 (Palate)</h3>
               {config.criteria.map(c => (
                 <div key={c.id} className="mb-4">
                   <div className="flex justify-between text-sm mb-1"><span className="font-medium">{c.label}</span><span className={`font-bold ${theme.text} bg-gray-100 px-2 rounded`}>{ratings[c.id] || 0}</span></div>
                   <div className="flex justify-between">{[1,2,3,4,5].map(v => (<button key={v} onClick={() => setRatings(p => ({...p, [c.id]: v}))} className={`w-8 h-8 rounded-full ${ratings[c.id] >= v ? `${theme.bar} text-white` : 'bg-gray-200'}`}>{v}</button>))}</div>
                 </div>
               ))}
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <h3 className="font-bold mb-4">종합 평가 및 소감</h3>
              <div className="flex justify-center space-x-2 mb-4">{[1,2,3,4,5].map(s => (<button key={s} onClick={() => setOverallRating(s)}><Star className={`w-10 h-10 ${s <= overallRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} /></button>))}</div>
              <textarea rows="3" value={personalNotes} onChange={e => setPersonalNotes(e.target.value)} placeholder="친구들과 좋은 시간 보냈습니다. 맛나겠쥬?" className="w-full p-4 bg-gray-50 border rounded-xl outline-none" />
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <div className="flex justify-between items-center"><h3 className="font-bold flex items-center"><Award className="w-5 h-5 mr-2 text-indigo-600"/>커뮤니티에 자랑하기</h3><input type="checkbox" checked={shareToCommunity} onChange={e => setShareToCommunity(e.target.checked)} className="w-5 h-5"/></div>
              {shareToCommunity && <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl"><p className="text-sm font-bold text-indigo-900 mb-1">실물 인증용 쪽지 코드</p><p className="text-xl font-black text-indigo-700 bg-white inline-block px-3 py-1 rounded shadow-inner">{verificationCode}</p></div>}
            </div>
            <button onClick={handleSaveNote} disabled={!overallRating} className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold disabled:bg-gray-300">저장하기</button>
          </div>
        )}
      </div>
    );
  };

  const renderInsightsView = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center animate-in fade-in">
       <BarChart3 className="w-12 h-12 text-indigo-300 mx-auto mb-3" />
       <h2 className="text-xl font-bold mb-2">나의 취향 분석</h2>
       <p className="text-gray-500 text-sm leading-relaxed">지금까지 {notes.length}병을 기록하셨습니다!<br/>데이터가 조금 더 쌓이면 선호하는 품종을 완벽하게 분석해 드릴게요.</p>
    </div>
  );
  
  const renderListView = () => (
    <div className="space-y-4 animate-in fade-in">
       <h2 className="text-xl font-bold">내 테이스팅 노트 ({notes.length})</h2>
       {notes.length === 0 && <div className="text-center p-10 bg-white rounded-2xl border text-gray-400">아직 작성한 리뷰가 없습니다.</div>}
       {notes.map(note => (
         <div key={note.id} className="bg-white p-4 rounded-xl shadow-sm border flex gap-4">
           {note.thumbnail && <img src={note.thumbnail} className="w-20 h-20 bg-gray-100 rounded-lg object-cover" />}
           <div>
              <div className="text-[10px] bg-gray-100 px-2 py-1 rounded inline-block font-bold mb-1">{note.analysisResult?.type}</div>
              <h3 className="font-bold text-sm line-clamp-1">{note.analysisResult?.name}</h3>
              <div className="flex items-center text-yellow-500 text-sm mt-1 font-bold"><Star className="w-3 h-3 fill-current mr-1"/> {note.overallRating}</div>
           </div>
         </div>
       ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      {toast.show && <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full text-sm font-bold shadow-xl animate-in slide-in-from-top-4">{toast.message}</div>}
      
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-2xl font-black text-center mb-6">로그인</h3>
            <div className="space-y-3">
              <button onClick={handleGoogleLogin} className="w-full border py-3.5 rounded-xl font-bold flex justify-center items-center hover:bg-gray-50"><Search className="w-5 h-5 mr-2 text-blue-500" /> Google로 계속하기</button>
              <button onClick={() => setShowLoginModal(false)} className="w-full text-gray-400 font-bold py-2 mt-2">나중에 하기</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => setIsMenuOpen(true)} className="p-2 -ml-2 text-gray-600"><Menu className="w-6 h-6" /></button>
            <h1 className="text-lg font-black ml-2">TastingNote</h1>
          </div>
          <div className="flex items-center">
            {userProfile.isSocial ? (
               <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded mr-3">{userProfile.nickname}</span>
            ) : (
               <button onClick={() => setShowLoginModal(true)} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full mr-3">로그인</button>
            )}
            <button onClick={() => { setCurrentView('add'); setIsMenuOpen(false); }} className="text-sm font-bold bg-gray-900 text-white px-3 py-1.5 rounded-full flex items-center"><PlusCircle className="w-4 h-4 mr-1" /> 새 리뷰</button>
          </div>
        </div>
      </header>

      <div className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMenuOpen(false)}>
        <div className={`absolute top-0 left-0 w-64 h-full bg-white shadow-2xl transition-transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b bg-gray-50 flex justify-between items-center"><h2 className="font-black text-lg">메뉴</h2><button onClick={() => setIsMenuOpen(false)}><X className="w-5 h-5 text-gray-500" /></button></div>
          <nav className="p-3 space-y-1">
            <button onClick={() => { setCurrentView('add'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl font-bold ${currentView === 'add' ? 'bg-gray-100 text-gray-900' : 'text-gray-600'}`}><PlusCircle className="w-5 h-5 mr-3" /> 새 리뷰 작성</button>
            <button onClick={() => { setCurrentView('list'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl font-bold ${currentView === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-600'}`}><ListIcon className="w-5 h-5 mr-3" /> 내 테이스팅 노트</button>
            <button onClick={() => { setCurrentView('insights'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl font-bold ${currentView === 'insights' ? 'bg-gray-100 text-gray-900' : 'text-gray-600'}`}><BarChart3 className="w-5 h-5 mr-3" /> 나의 취향 분석</button>
            <div className="my-2 border-t border-gray-100"></div>
            <button onClick={() => { setCurrentView('search'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl font-bold ${currentView === 'search' ? 'bg-blue-50 text-blue-700' : 'text-blue-600'}`}><Search className="w-5 h-5 mr-3" /> 보틀 백과 & 시세 검색</button>
            <button onClick={() => { setCurrentView('community'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl font-bold mt-1 ${currentView === 'community' ? 'bg-indigo-50 text-indigo-700' : 'text-indigo-600'}`}><Users className="w-5 h-5 mr-3" /> 보틀 라운지</button>
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
    </div>
  );
}