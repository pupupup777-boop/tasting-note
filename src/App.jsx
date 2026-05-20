import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, Wine, Star, Menu, X, List as ListIcon, BarChart3, PlusCircle, Search, SortDesc, DollarSign, Users, MessageSquare, ShieldCheck, Award, Send, MapPin, BookOpen, ChevronUp, ChevronDown, Check, Loader2, Lock } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDfsow7Q73INwwaFylX4De6LwKrmEDovcE",
  authDomain: "chill-sip.firebaseapp.com",
  projectId: "chill-sip",
  storageBucket: "chill-sip.firebasestorage.app",
  messagingSenderId: "597973066423",
  appId: "1:597973066423:web:cd9b1bea283855c30ca332",
  measurementId: "G-VLN1Y7FWR5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
    id: 'beer', name: '크래프트 맥주', icon: '🍺', theme: 'yellow',
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
      bg: 'bg-[#FAF5F5]', 
      text: 'text-[#82545A]', 
      border: 'border-[#EADADF]', 
      btnBg: 'bg-[#82545A] hover:bg-[#6D4247]', 
      gradient: 'from-[#503236] to-[#251E22]', 
      bar: 'bg-[#82545A]' 
    },
    amber: { 
      bg: 'bg-[#FAF7F2]', 
      text: 'text-[#856C4D]', 
      border: 'border-[#EAE2D4]', 
      btnBg: 'bg-[#856C4D] hover:bg-[#705A3F]', 
      gradient: 'from-[#4D3F2E] to-[#211E1A]', 
      bar: 'bg-[#856C4D]' 
    },
    blue: { 
      bg: 'bg-[#F3F6F9]', 
      text: 'text-[#586F85]', 
      border: 'border-[#DAE3EB]', 
      btnBg: 'bg-[#586F85] hover:bg-[#475A6E]', 
      gradient: 'from-[#374959] to-[#1A1F24]', 
      bar: 'bg-[#586F85]' 
    },
    yellow: { 
      bg: 'bg-[#FAF9F3]', 
      text: 'text-[#8F815C]', 
      border: 'border-[#EAE5D4]', 
      btnBg: 'bg-[#8F815C] hover:bg-[#7A6E4D]', 
      gradient: 'from-[#524B38] to-[#24221C]', 
      bar: 'bg-[#8F815C]' 
    }
  };
  return map[theme] || map.rose;
};

const resizeImage = (base64Str, maxWidth = 400) => {
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

const FractionalStarRating = ({ value, onChange, onSave, isLocked }) => {
  const [hoverValue, setHoverValue] = useState(null);
  const containerRef = useRef(null);

  const handlePointerMove = (e) => {
    if (isLocked) return;
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
    if (isLocked) return;
    if (hoverValue !== null) {
      onChange && onChange(hoverValue);
      onSave && onSave(hoverValue);
      setHoverValue(null);
    }
  };

  const displayValue = hoverValue !== null ? hoverValue : value;

  return (
    <div className="flex flex-col items-center">
        <span className={`text-xl font-black mb-1 flex items-center gap-1 ${isLocked ? 'text-gray-400' : 'text-amber-500'}`}>
          {displayValue.toFixed(1)}
          {isLocked && <Lock className="w-3.5 h-3.5 text-gray-400" />}
        </span>
        <div
          ref={containerRef}
          className={`flex space-x-1 touch-none ${isLocked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
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
              <div key={star} className="relative w-8 h-8 text-gray-200 drop-shadow-sm">
                <Star className="w-8 h-8 absolute top-0 left-0" />
                <div className="absolute top-0 left-0 overflow-hidden text-amber-400" style={{ width: `${fillPercentage}%` }}>
                  <Star className="w-8 h-8 fill-current" />
                </div>
              </div>
            );
          })}
        </div>
        {isLocked && <span className="text-[10px] text-gray-400 mt-1 font-semibold bg-gray-100 px-2 py-0.5 rounded-full">평가 잠금됨</span>}
    </div>
  );
};

export default function TastingApp() {
  const [currentView, setCurrentView] = useState('community');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // 유저 및 세션 데이터
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState({ nickname: '', badge: '🥚 알콜 입문자', isSocial: false });
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 로컬 및 공용 데이터 스토어
  const [notes, setNotes] = useState([]);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityFilter, setCommunityFilter] = useState('all');
  const [communitySort, setCommunitySort] = useState('latest');
  const [commentInputs, setCommentInputs] = useState({});

  // 신규 글 작성 상태
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

  // 시세 및 정보 탐색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.warn("Firebase Auth가 오프라인이거나 비활성화 상태입니다. 임시 로컬 모드로 가동합니다.");
        setUser({ uid: 'local-test-user-999', isAnonymous: true });
        setUserProfile(p => ({ ...p, nickname: '방문 테스터' }));
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        initAuth();
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || user.uid === 'local-test-user-999') return;
    
    const notesRef = collection(db, 'users', user.uid, 'notes');
    const unsubscribeNotes = onSnapshot(query(notesRef), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => b.createdAt - a.createdAt);
      setNotes(data);
    });

    const publicRef = collection(db, 'community_posts');
    const unsubscribeCommunity = onSnapshot(query(publicRef), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCommunityPosts(data);
    });

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
    showToast("구글 로그인을 연결 중...", "info");
    setTimeout(async () => {
       if (user) {
         const newNickname = 'Google유저_' + Math.floor(1000 + Math.random() * 9000);
         if (user.uid !== 'local-test-user-999') {
             await updateDoc(doc(db, 'users', user.uid), { nickname: newNickname, isSocial: true });
         }
         setUserProfile(p => ({ ...p, nickname: newNickname, isSocial: true }));
         setShowLoginModal(false);
         showToast("Google 계정 로그인 연동 성공!", "success");
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
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "서버 응답 오류");
      }
      
      const data = await response.json();
      
      if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
        const parsedData = JSON.parse(data.candidates[0].content.parts[0].text);
        setSearchResult(parsedData);
      } else if (data.error) {
        alert(`구글 에러: ${data.error.message}`);
      } else {
        alert("데이터를 읽어오지 못했습니다.");
      }
    } catch (e) {
      alert("검색 에러 발생: " + e.message);
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
        const compressedBase64 = await resizeImage(reader.result, 400);
        setImage(compressedBase64); 
        const base64Data = compressedBase64.split(',')[1];
        
        // 🚀 주종 자동 조정을 위해 전체 주종 명칭을 AI 프롬프트에 제공
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `이 술 라벨 사진을 분석해서 정보를 추출해줘. 
                특히 이 술이 와인인지, 위스키인지, 사케/전통주인지, 크래프트 맥주인지 인지하고, 해당하는 주종 식별 키를 'detectedType' 필드에 정확하게 적어야 해. 
                주종 식별 키 종류: 'wine', 'whiskey', 'sake', 'beer'
                반드시 다른 설명은 일절 하지 말고, 지정된 JSON 규격에 맞춰서만 답변을 작성해줘.` },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
              ]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  "name": { "type": "STRING", "description": "제품의 한글 혹은 영문 이름" },
                  "type": { "type": "STRING", "description": "세부 종류 혹은 스타일" },
                  "region": { "type": "STRING", "description": "생산 국가 및 지역" },
                  "vintage": { "type": "STRING", "description": "생산 연도 혹은 숙성 연수 (정보가 없으면 null)" },
                  "grape": { "type": "STRING", "description": "핵심 원재료, 품종, 혹은 특징" },
                  "producer": { "type": "STRING", "description": "생산자 혹은 양조장 이름" },
                  "detectedType": { "type": "STRING", "description": "반드시 'wine', 'whiskey', 'sake', 'beer' 중 하나여야 함" }
                },
                "required": ["name", "type", "region", "vintage", "grape", "producer", "detectedType"]
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
          
          // 🚀 [AI 자동 보정] 선택한 주종과 AI가 인식한 주종이 다르면 실시간으로 테마 및 설정 자동 동기화!
          const detected = parsedResult.detectedType;
          if (detected && LIQUOR_CONFIG[detected] && detected !== selectedLiquorType) {
            setSelectedLiquorType(detected);
            showToast(`AI 분석결과 ${LIQUOR_CONFIG[detected].name}로 감지되어 자동으로 주종이 변경되었습니다!`, "info");
          }

          setAnalysisResult(parsedResult);
          
          const finalConfig = LIQUOR_CONFIG[detected] || LIQUOR_CONFIG[selectedLiquorType];
          const initialRatings = {};
          finalConfig.criteria.forEach(c => initialRatings[c.id] = 0);
          setRatings(initialRatings);
          setExpandedAromaCategory(finalConfig.aromas[0].category);
          
          showToast("라벨 자동 분석 및 테마 변경 완료!", "success");
        } else {
          alert("라벨의 디테일을 읽을 수 없습니다. 밝은 조명 아래서 다시 촬영해주세요.");
        }
      } catch (error) {
        console.error("라벨 분석 에러:", error);
        alert("라벨 분석 오류: " + error.message);
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveNote = async () => {
    // 🚀 [디버깅 1단계] 함수 시작 확인
    alert("🚨 디버깅: 1. 저장 함수 시작됨");

    // 🚀 [디버깅 2단계] 필수 데이터 상태 점검
    alert(`🚨 디버깅: 2. 데이터 점검 - 분석결과 존재: ${analysisResult ? 'O' : 'X'}, 유저 존재: ${user ? 'O (uid: '+user.uid+')' : 'X'}`);

    // 원래 있던 조건문 (여기서 리턴되면 침묵의 리턴)
    if (!analysisResult || !user) {
        alert("🚨 디버깅 멈춤: 3. AI 분석 결과나 유저 정보가 없어서 실행이 중단됩니다. (null 조건에 걸림)");
        return;
    }

    // 🚀 [디버깅 3단계] 조건 통과 후 데이터 생성 시작 확인
    alert("🚨 디버깅: 4. 조건 통과, 저장 데이터 생성 시작");

    const newNote = {
      liquorType: selectedLiquorType,
      analysisResult,
      ratings,
      selectedAromas,
      personalNotes,
      overallRating,
      thumbnail: image, // 현재 압축된 이미지 (Base64)
      createdAt: Date.now()
    };

    // 🚀 [디버깅 4단계] 저장 데이터 최종 용량 점검
    const dataSize = JSON.stringify(newNote).length;
    alert(`🚨 디버깅: 5. 데이터 생성 완료 (최종 용량: ${dataSize} 바이트)`);

    // 🚀 [디버깅 5단계] 파이어베이스 전송 직전 확인
    alert(`🚨 디버깅: 6. 파이어베이스 컬렉션('users/${user.uid}/notes')으로 전송 시도 직전!!!`);

    try {
      // 파이어베이스 데이터베이스(Firestore)에 쓰기 시도
      const docRef = await addDoc(collection(db, 'users', user.uid, 'notes'), newNote);
      
      // 🚀 [디버깅 6단계] 파이어베이스 저장 성공
      alert("🚨 디버깅: 7. 파이어베이스 문서 저장 완.료! 생성된 문서 ID: " + docRef.id);

      if (shareToCommunity) {
        // 🚀 [디버깅 7단계] 커뮤니티 공유 시도 확인
        alert("🚨 디버깅: 8. 커뮤니티 공유 시도 중...");
        await addDoc(collection(db, 'community_posts'), {
          ...newNote,
          userId: user.uid,
          userName: userProfile.nickname,
          totalCommunityScore: 0,
          ratings: {},
          comments: [],
          isVerified: true,
          verificationCodeUsed: verificationCode
        });
        // 🚀 [디버깅 8단계] 커뮤니티 공유 성공
        alert("🚨 디버깅: 9. 커뮤니티 공유 완료!");
      }

      showToast("노트가 성공적으로 저장되었습니다!");
      
      // 상태 초기화 및 화면 이동
      setImage(null);
      setAnalysisResult(null);
      setPersonalNotes('');
      setOverallRating(0);
      setShareToCommunity(false);
      setCurrentView('list');

    } catch (err) {
      // 🚀 [디버깅 9단계] 파이어베이스 전송 실패
      console.error("저장 오류 상세:", err);
      // alert창을 통해 에러 내용을 강력하게 표시!
      alert("🚨 디버깅 실패: 10. 파이어베이스 최종 저장 거부!!! 에러내용: " + err.message + "\n(에러코드: " + err.code + ")");
    }
  };

  const handleRatePost = async (postId, currentRatings, score) => {
    if (!user) return;
    const postRef = doc(db, 'community_posts', postId);
    const updatedRatings = { ...(currentRatings || {}) };
    updatedRatings[user.uid] = score;
    const totalScore = Object.values(updatedRatings).reduce((acc, curr) => acc + curr, 0);
    await updateDoc(postRef, { ratings: updatedRatings, totalCommunityScore: totalScore });
    showToast(`부러움 평가 점수 ${score}점이 반영되었습니다!`);
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
      <div className="bg-gradient-to-r from-stone-800 to-zinc-900 rounded-2xl p-6 text-white shadow-md">
        <h2 className="text-xl font-bold flex items-center mb-2"><Search className="w-6 h-6 mr-2 text-stone-300" /> 보틀 백과 & 시세 검색</h2>
        <p className="text-sm text-stone-200 opacity-90 leading-relaxed">궁금한 보틀 이름을 검색해 보세요. 최신 시중 판매 기록과 성지 할인 가격을 가볍게 요약해 드립니다.</p>
      </div>
      <div className="flex items-center space-x-2 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
        <input 
          type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearchLiquor()}
          placeholder="예: 발베니 12년 더블우드, 돔 페리뇽" className="flex-1 bg-transparent px-3 py-2 outline-none text-gray-800 text-sm"
        />
        <button onClick={handleSearchLiquor} disabled={isSearching || !searchQuery} className="bg-stone-800 hover:bg-stone-900 text-white p-3 rounded-xl disabled:opacity-50">
          {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        </button>
      </div>
      {searchResult && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in">
          <div className="bg-gray-50 px-5 py-4 border-b flex justify-between"><h3 className="font-black text-base text-stone-800">{searchResult.name}</h3><span className="bg-stone-100 text-stone-700 text-[10px] font-bold px-2 py-1 rounded">보틀 백과</span></div>
          <div className="p-5 space-y-5">
            <div><h4 className="flex text-sm font-bold text-stone-700 mb-1.5"><BookOpen className="w-4 h-4 mr-1.5 text-gray-400" /> 역사 및 특징</h4><p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl leading-relaxed">{searchResult.summary}</p></div>
            <div><h4 className="flex text-sm font-bold text-stone-700 mb-1.5"><Wine className="w-4 h-4 mr-1.5 text-gray-400" /> 테이스팅 노트</h4><p className="text-sm text-gray-600 bg-stone-50/50 p-3 rounded-xl border border-stone-100 leading-relaxed">{searchResult.tasting}</p></div>
            <div className="grid gap-3 pt-2">
              <div className="bg-[#FAF9F5] border border-[#EAE5D4] p-4 rounded-xl"><h4 className="flex text-xs font-bold text-[#8F815C] mb-1"><DollarSign className="w-4 h-4 mr-1"/> 시중 평균 시세</h4><p className="text-sm font-medium text-stone-800">{searchResult.avgPrice}</p></div>
              <div className="bg-[#FAF7F2] border border-[#EAE2D4] p-4 rounded-xl"><h4 className="flex text-xs font-bold text-[#856C4D] mb-1"><MapPin className="w-4 h-4 mr-1"/> 최근 할인 및 성지 정보</h4><p className="text-sm font-medium text-stone-800">{searchResult.bargainInfo}</p></div>
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
        <div className="bg-gradient-to-r from-stone-800 via-zinc-900 to-[#1A1F24] rounded-2xl p-6 text-white shadow-md">
          <h2 className="text-xl font-bold flex items-center mb-2"><Users className="w-6 h-6 mr-2 text-stone-200" /> 테이스터스 라운지</h2>
          <p className="text-sm text-stone-300 opacity-90 mb-4">친구들의 보틀을 평가하고 순위를 결정해 보세요!</p>
          <div className="bg-white/10 rounded-lg px-3 py-2 text-xs font-medium border border-white/20 inline-block backdrop-blur-sm">
              내 칭호: <span className="text-amber-300 text-sm font-bold mx-1">{userStats[user?.uid]?.badge || '🥚 알콜 입문자'}</span> 
              <span className="bg-white/20 px-2 py-0.5 rounded-full ml-1">{(userStats[user?.uid]?.totalScore || 0).toFixed(1)}점</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 snap-x">
          <button onClick={() => setCommunityFilter('all')} className={`snap-start px-4 py-2 rounded-full text-xs font-bold ${communityFilter === 'all' ? 'bg-stone-800 text-white shadow-sm' : 'bg-white text-gray-500 border'}`}>전체</button>
          {Object.values(LIQUOR_CONFIG).map(l => (
            <button key={l.id} onClick={() => setCommunityFilter(l.id)} className={`snap-start px-4 py-2 rounded-full text-xs font-bold flex items-center ${communityFilter === l.id ? `${getThemeClasses(l.theme).btnBg} text-white shadow-sm` : 'bg-white text-gray-500 border'}`}><span className="mr-1">{l.icon}</span> {l.name}</button>
          ))}
        </div>
        <div className="flex justify-end"><select onChange={(e) => setCommunitySort(e.target.value)} className="text-xs bg-white border p-1.5 rounded-lg shadow-sm outline-none text-gray-500"><option value="latest">최신글순</option><option value="best">인기 점수순</option></select></div>
        
        {displayedPosts.length === 0 && (
            <div className="text-center py-12 text-gray-400 border border-gray-100 rounded-2xl border-dashed bg-white">
                작성된 라운지 피드가 없습니다. 소중한 첫 보틀을 등록해 보세요!
            </div>
        )}

        {displayedPosts.map(post => {
            const authorStats = userStats[post.userId] || {};
            const conf = LIQUOR_CONFIG[post.liquorType] || LIQUOR_CONFIG.wine;
            
            // 🚀 [부러움 평가 락] 이미 해당 글에 평가를 내린 기록이 있다면 드래그 잠금 상태로 렌더링
            const myPrevRating = post.ratings?.[user?.uid];
            const isLocked = myPrevRating !== undefined && myPrevRating > 0;

            return (
              <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 flex items-center justify-between border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center font-bold text-gray-600 border border-gray-100">{post.userName?.charAt(0) || '?'}</div>
                    <div>
                      <div className="font-bold text-sm text-gray-800 flex items-center gap-1.5">{post.userName} <span className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-100">{authorStats.badge}</span>{authorStats.isTop && <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded font-bold border border-amber-100">🏆 명예 1위</span>}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{new Date(post.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  {post.isVerified && <div className="flex bg-blue-50/50 text-[#586F85] px-2 py-1 rounded text-xs font-bold border border-blue-100/50"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> 실물 인증</div>}
                </div>
                <div className="p-4">
                  <div className="flex gap-4 mb-4">
                    {post.thumbnail && <div className="w-24 h-24 bg-gray-100 rounded-lg border flex-shrink-0 relative overflow-hidden"><img src={post.thumbnail} className="w-full h-full object-cover" /><div className="absolute top-1 left-1 bg-black/40 text-white rounded w-6 h-6 flex items-center justify-center text-xs backdrop-blur-xs">{conf.icon}</div></div>}
                    <div>
                       <div className={`text-[10px] font-bold px-2 py-1 rounded mb-1.5 inline-block ${getThemeClasses(conf.theme).bg} ${getThemeClasses(conf.theme).text}`}>{post.analysisResult?.type || conf.name}</div>
                       <h3 className="font-bold text-stone-800 leading-tight mb-1">{post.analysisResult?.name || '이름 없음'}</h3>
                       <p className="text-xs text-gray-400">{post.analysisResult?.region}</p>
                    </div>
                  </div>
                  {post.personalNotes && <div className="text-sm text-stone-600 bg-gray-50 p-4 rounded-xl border border-gray-100 font-medium leading-relaxed italic">"{post.personalNotes}"</div>}
                </div>
                <div className="px-4 py-4 border-t bg-gray-50/50 flex justify-between items-center border-b border-gray-50">
                  <div className="flex flex-col items-center">
                    <span className="text-[11px] text-gray-400 font-semibold mb-2">부러움 평가 (드래그)</span>
                    <FractionalStarRating 
                      value={myPrevRating || 0} 
                      onSave={(score) => handleRatePost(post.id, post.ratings, score)} 
                      isLocked={isLocked}
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 font-semibold mb-1">총 부러움 점수</span>
                    <div className="flex items-center text-amber-700 bg-amber-50/50 px-3 py-1.5 rounded-lg border border-amber-100"><Award className="w-4 h-4 mr-1" /><span className="font-black text-base">{(post.totalCommunityScore || 0).toFixed(1)}</span></div>
                  </div>
                </div>
                <div className="p-4 bg-white">
                  <div className="space-y-2 mb-3">{(post.comments || []).map(c => (<div key={c.id} className="text-xs text-stone-700"><span className="font-bold mr-2 text-stone-900">{c.userName}</span><span>{c.text}</span></div>))}</div>
                  <div className="flex"><input type="text" value={commentInputs[post.id] || ''} onChange={(e) => setCommentInputs(p => ({...p, [post.id]: e.target.value}))} placeholder="댓글을 남겨보세요..." className="flex-1 border border-gray-100 rounded-full px-4 py-1.5 text-xs outline-none focus:border-stone-300"/><button onClick={() => handleAddComment(post.id)} className="ml-2 w-8 h-8 bg-stone-800 text-white rounded-full flex items-center justify-center hover:bg-stone-900 transition-colors"><Send className="w-3.5 h-3.5"/></button></div>
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
              <button key={l.id} onClick={() => { setSelectedLiquorType(l.id); setImage(null); }} className={`px-5 py-3 rounded-2xl font-bold flex-shrink-0 transition-all ${selectedLiquorType === l.id ? `${getThemeClasses(l.theme).btnBg} text-white shadow-sm` : 'bg-white text-gray-400 border border-gray-100'}`}><span className="mr-2 text-xl">{l.icon}</span> {l.name}</button>
            ))}
          </div>
        )}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
          {!image ? (
            <div onClick={triggerFileInput} className={`border-2 border-dashed ${theme.border} rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-[#FCFDFD] hover:bg-gray-50 transition-colors`}>
              <Camera className={`w-12 h-12 ${theme.text} mb-3`} /><p className={`font-semibold ${theme.text} text-sm`}>라벨 촬영 및 업로드</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-gray-100"><img src={image} className="w-full h-48 object-contain bg-gray-100" /></div>
          )}
          {isAnalyzing && <div className="mt-4 p-4 bg-gray-50 rounded-xl text-center flex flex-col items-center"><Loader2 className="animate-spin mb-2 text-stone-500" /><p className="font-bold text-xs text-stone-600">AI가 술 정보를 분석하고 있습니다...</p></div>}
          {analysisResult && !isAnalyzing && (
            <div className={`mt-6 bg-gradient-to-br ${theme.gradient} text-white rounded-xl p-5 shadow-sm`}><h2 className="text-base font-bold leading-tight">{analysisResult.name}</h2><span className="bg-white/20 px-2 py-0.5 rounded text-[10px] mt-2 inline-block font-semibold uppercase">{analysisResult.type}</span></div>
          )}
        </div>
        {analysisResult && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
               <h3 className="font-bold text-sm mb-4 text-stone-800">맛의 균형 (Palate)</h3>
               {config.criteria.map(c => (
                 <div key={c.id} className="mb-4">
                   <div className="flex justify-between text-xs mb-1.5"><span className="font-semibold text-stone-700">{c.label}</span><span className={`font-bold ${theme.text} ${theme.bg} px-2 rounded-full`}>{ratings[c.id] || 0}</span></div>
                   <div className="flex justify-between">{[1,2,3,4,5].map(v => (<button key={v} onClick={() => setRatings(p => ({...p, [c.id]: v}))} className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${ratings[c.id] >= v ? `${theme.bar} text-white` : 'bg-gray-100 text-gray-400'}`}>{v}</button>))}</div>
                 </div>
               ))}
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
              <h3 className="font-bold text-sm mb-4 text-stone-800">종합 평가 및 소감</h3>
              <div className="flex justify-center space-x-2 mb-4">{[1,2,3,4,5].map(s => (<button key={s} onClick={() => setOverallRating(s)}><Star className={`w-9 h-9 ${s <= overallRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} /></button>))}</div>
              <textarea rows="3" value={personalNotes} onChange={e => setPersonalNotes(e.target.value)} placeholder="맛, 향기, 기분 좋았던 순간들을 자유롭게 남겨보세요." className="w-full p-4 bg-gray-50 border border-gray-100 rounded-xl outline-none text-xs text-stone-700 leading-relaxed resize-none focus:border-stone-300" />
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-50">
              <div className="flex justify-between items-center"><h3 className="font-bold text-sm flex items-center text-stone-800"><Award className="w-5 h-5 mr-2 text-stone-600"/>커뮤니티(라운지)에 공유</h3><input type="checkbox" checked={shareToCommunity} onChange={e => setShareToCommunity(e.target.checked)} className="w-5 h-5 accent-stone-800 rounded" /></div>
              {shareToCommunity && <div className="mt-4 p-4 bg-stone-50 border border-stone-100 rounded-xl"><p className="text-xs font-bold text-stone-700 mb-1">실물 인증용 코드</p><p className="text-lg font-black text-stone-800 bg-white inline-block px-3 py-1 rounded shadow-inner tracking-widest">{verificationCode}</p></div>}
            </div>
            <button onClick={handleSaveNote} disabled={!overallRating} className="w-full bg-stone-800 hover:bg-stone-900 text-white py-4 rounded-xl font-bold text-sm transition-colors disabled:bg-gray-300 shadow-sm">노트 저장하기</button>
          </div>
        )}
      </div>
    );
  };

  const renderInsightsView = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center animate-in fade-in">
       <BarChart3 className="w-12 h-12 text-stone-300 mx-auto mb-3" />
       <h2 className="text-base font-bold mb-1.5 text-stone-800">나의 취향 분석</h2>
       <p className="text-gray-400 text-xs leading-relaxed">지금까지 총 {notes.length}병을 기록하셨습니다.<br/>나만의 시음 기록이 조금 더 쌓이면, 선호 품종 및 주향 성향을 정교하게 도출해 드릴게요.</p>
    </div>
  );
  
  const renderListView = () => (
    <div className="space-y-4 animate-in fade-in">
       <h2 className="text-lg font-bold text-stone-800">내 테이스팅 노트 ({notes.length})</h2>
       {notes.length === 0 && <div className="text-center p-12 bg-white rounded-2xl border border-gray-100 text-gray-400 text-xs">아직 기록된 시음 노트가 없습니다.</div>}
       {notes.map(note => {
         const conf = LIQUOR_CONFIG[note.liquorType] || LIQUOR_CONFIG.wine;
         return (
           <div key={note.id} className="bg-white p-4 rounded-xl shadow-xs border border-gray-100 flex gap-4">
             {note.thumbnail && <img src={note.thumbnail} className="w-16 h-16 bg-gray-50 rounded-lg object-cover border border-gray-100" />}
             <div className="flex-1">
                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-block mb-1 ${getThemeClasses(conf.theme).bg} ${getThemeClasses(conf.theme).text}`}>{note.analysisResult?.type || conf.name}</div>
                <h3 className="font-bold text-xs text-stone-800 line-clamp-1">{note.analysisResult?.name}</h3>
                <div className="flex items-center text-yellow-500 text-xs mt-1 font-bold"><Star className="w-3 h-3 fill-current mr-1"/> {note.overallRating}</div>
             </div>
           </div>
         );
       })}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      {toast.show && <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-stone-900 text-white px-6 py-3 rounded-full text-xs font-bold shadow-xl animate-in slide-in-from-top-4">{toast.message}</div>}
      
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-center mb-6 text-stone-800">계정 연동</h3>
            <div className="space-y-3">
              <button onClick={handleGoogleLogin} className="w-full border border-gray-200 py-3.5 rounded-xl font-bold text-sm flex justify-center items-center hover:bg-gray-50 text-stone-700 transition-colors"><Search className="w-4 h-4 mr-2 text-blue-500" /> Google 계정으로 로그인</button>
              <button onClick={() => setShowLoginModal(false)} className="w-full text-gray-400 font-semibold text-xs py-2 mt-2">다음에 하기</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => setIsMenuOpen(true)} className="p-2 -ml-2 text-stone-600"><Menu className="w-6 h-6" /></button>
            <h1 className="text-base font-black ml-2 text-stone-800">TastingNote</h1>
          </div>
          <div className="flex items-center">
            {userProfile.isSocial ? (
               <span className="text-[10px] font-bold bg-stone-100 text-stone-700 px-2.5 py-1 rounded-full mr-3 border border-stone-200">{userProfile.nickname}</span>
            ) : (
               <button onClick={() => setShowLoginModal(true)} className="text-xs font-bold text-stone-600 bg-stone-100 px-3 py-1.5 rounded-full mr-3 border border-stone-200 hover:bg-stone-200 transition-colors">로그인</button>
            )}
            <button onClick={() => { setCurrentView('add'); setIsMenuOpen(false); }} className="text-xs font-bold bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-full flex items-center shadow-sm"><PlusCircle className="w-3.5 h-3.5 mr-1" /> 새 리뷰</button>
          </div>
        </div>
      </header>

      <div className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsMenuOpen(false)}>
        <div className={`absolute top-0 left-0 w-64 h-full bg-white shadow-2xl transition-transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center"><h2 className="font-bold text-stone-800 text-sm">탐색 메뉴</h2><button onClick={() => setIsMenuOpen(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
          <nav className="p-3 space-y-1">
            <button onClick={() => { setCurrentView('add'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl text-xs font-bold ${currentView === 'add' ? 'bg-stone-50 text-stone-800' : 'text-gray-500 hover:bg-gray-50'}`}><PlusCircle className="w-4 h-4 mr-3" /> 새 리뷰 작성</button>
            <button onClick={() => { setCurrentView('list'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl text-xs font-bold ${currentView === 'list' ? 'bg-stone-50 text-stone-800' : 'text-gray-500 hover:bg-gray-50'}`}><ListIcon className="w-4 h-4 mr-3" /> 내 테이스팅 노트</button>
            <button onClick={() => { setCurrentView('insights'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl text-xs font-bold ${currentView === 'insights' ? 'bg-stone-50 text-stone-800' : 'text-gray-500 hover:bg-gray-50'}`}><BarChart3 className="w-4 h-4 mr-3" /> 나의 취향 분석</button>
            <div className="my-2 border-t border-gray-100"></div>
            <button onClick={() => { setCurrentView('search'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl text-xs font-bold ${currentView === 'search' ? 'bg-stone-50 text-stone-800' : 'text-gray-500 hover:bg-gray-50'}`}><Search className="w-4 h-4 mr-3" /> 보틀 백과 & 시세 검색</button>
            <button onClick={() => { setCurrentView('community'); setIsMenuOpen(false); }} className={`w-full flex items-center px-4 py-3 rounded-xl text-xs font-bold mt-1 ${currentView === 'community' ? 'bg-stone-50 text-stone-800' : 'text-gray-500 hover:bg-gray-50'}`}><Users className="w-4 h-4 mr-3" /> 보틀 라운지</button>
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