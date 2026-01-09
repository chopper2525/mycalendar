import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Calendar, Trash2, CheckCircle2, XCircle, Lock, Unlock, Loader2, KeyRound, X } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDPTVv48gCD0HdjjSBAoRMxo6hm6btGbKY",
  authDomain: "mycalendar-3c583.firebaseapp.com",
  projectId: "mycalendar-3c583",
  storageBucket: "mycalendar-3c583.firebasestorage.app",
  messagingSenderId: "270183106668",
  appId: "1:270183106668:web:70b0b2e783ac08577bb049",
  measurementId: "G-M2FHT3HR5Q"
};

/**
 * 日本の祝日計算ヘルパー
 */
const getJapaneseHolidays = (year) => {
  const holidays = {};
  const add = (date, name) => {
    holidays[date.toISOString().split('T')[0]] = name;
  };

  add(new Date(year, 0, 1), "元日");
  add(new Date(year, 1, 11), "建国記念の日");
  add(new Date(year, 1, 23), "天皇誕生日");
  add(new Date(year, 3, 29), "昭和の日");
  add(new Date(year, 4, 3), "憲法記念日");
  add(new Date(year, 4, 4), "みどりの日");
  add(new Date(year, 4, 5), "こどもの日");
  add(new Date(year, 7, 11), "山の日");
  add(new Date(year, 10, 3), "文化の日");
  add(new Date(year, 10, 23), "勤労感謝の日");

  const comingOfAge = new Date(year, 0, 1);
  comingOfAge.setDate(1 + (1 - comingOfAge.getDay() + 7) % 7 + 7);
  add(comingOfAge, "成人の日");

  const marineDay = new Date(year, 6, 1);
  marineDay.setDate(1 + (1 - marineDay.getDay() + 7) % 7 + 14);
  add(marineDay, "海の日");

  const respectAged = new Date(year, 8, 1);
  respectAged.setDate(1 + (1 - respectAged.getDay() + 7) % 7 + 14);
  add(respectAged, "敬老の日");

  const sportsDay = new Date(year, 9, 1);
  sportsDay.setDate(1 + (1 - sportsDay.getDay() + 7) % 7 + 7);
  add(sportsDay, "スポーツの日");

  const equinoxSpring = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(new Date(year, 2, equinoxSpring), "春分の日");
  const equinoxAutumn = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(new Date(year, 8, equinoxAutumn), "秋分の日");

  return holidays;
};

const HangingSignIcon = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 2L4 7" strokeWidth="1" />
    <path d="M16 2L20 7" strokeWidth="1" />
    <rect x="2" y="7" width="20" height="13" rx="1.5" fill={active ? "currentColor" : "white"} strokeWidth="1.5" />
    <text x="12" y="14.5" dominantBaseline="middle" textAnchor="middle" fontSize="4.5" fontFamily="sans-serif" fontWeight="900" fill={active ? "white" : "currentColor"} stroke="none">定休日</text>
    {!active && <line x1="6" y1="17" x2="18" y2="17" strokeWidth="0.5" opacity="0.3" />}
  </svg>
);

const SLOT_STATUS = { NONE: 'none', AVAILABLE: 'available', UNAVAILABLE: 'unavailable' };

const App = () => {
  const [months, setMonths] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [holidays, setHolidays] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState(false);
  const observer = useRef();

  // (1) Auth Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // (2) Fetch Data from Firestore
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSchedule(data.schedule || {});
      }
    }, (err) => {
        console.error("Firestore error:", err);
    });

    return () => unsubscribe();
  }, [user]);

  // Initial Month Generation
  useEffect(() => {
    const today = new Date();
    const initialMonths = [];
    const allHolidays = {};
    for (let i = 0; i < 4; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      initialMonths.push({ year: d.getFullYear(), month: d.getMonth() });
      Object.assign(allHolidays, getJapaneseHolidays(d.getFullYear()));
    }
    setMonths(initialMonths);
    setHolidays(allHolidays);
  }, []);

  const loadMoreMonths = useCallback(() => {
    setMonths(prev => {
      const last = prev[prev.length - 1];
      const nextDate = new Date(last.year, last.month + 1, 1);
      const newMonth = { year: nextDate.getFullYear(), month: nextDate.getMonth() };
      setHolidays(h => ({...h, ...getJapaneseHolidays(newMonth.year)}));
      return [...prev, newMonth];
    });
  }, []);

  const lastMonthElementRef = useCallback(node => {
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMoreMonths();
    });
    if (node) observer.current.observe(node);
  }, [loadMoreMonths]);

  // Cloud Save Function
  const saveToCloud = async (newSchedule) => {
    if (!user || !isEditMode) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state');
      await setDoc(docRef, { schedule: newSchedule, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleSlotStatus = (dateStr, slot) => {
    if (!isEditMode) return;
    const dayData = schedule[dateStr] || { am: SLOT_STATUS.NONE, pm: SLOT_STATUS.NONE, isClosed: false };
    if (dayData.isClosed) return;

    const current = dayData[slot];
    let next;
    if (current === SLOT_STATUS.NONE) next = SLOT_STATUS.AVAILABLE;
    else if (current === SLOT_STATUS.AVAILABLE) next = SLOT_STATUS.UNAVAILABLE;
    else next = SLOT_STATUS.NONE;

    const newSchedule = { ...schedule, [dateStr]: { ...dayData, [slot]: next } };
    setSchedule(newSchedule);
    saveToCloud(newSchedule);
  };

  const toggleRegularHoliday = (dateStr) => {
    if (!isEditMode) return;
    const dayData = schedule[dateStr] || { am: SLOT_STATUS.NONE, pm: SLOT_STATUS.NONE, isClosed: false };
    const newSchedule = { ...schedule, [dateStr]: { ...dayData, isClosed: !dayData.isClosed } };
    setSchedule(newSchedule);
    saveToCloud(newSchedule);
  };

  const resetAll = async () => {
    if (!isEditMode || !window.confirm('すべての予定をリセットしますか？')) return;
    setSchedule({});
    await saveToCloud({});
  };

  const handleEditToggle = () => {
    if (isEditMode) {
      setIsEditMode(false);
    } else {
      setShowPassModal(true);
      setPassInput("");
      setPassError(false);
    }
  };

  const handlePassConfirm = (e) => {
    if (e) e.preventDefault();
    if (passInput === "0120") {
      setIsEditMode(true);
      setShowPassModal(false);
    } else {
      setPassError(true);
    }
  };

  const getDaysInMonth = (year, month) => {
    const date = new Date(year, month, 1);
    const days = [];
    const firstDayIndex = date.getDay();
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const SlotDisplay = ({ status, label }) => {
    const baseStyles = "flex-1 rounded-md border flex items-center justify-center transition-all m-0.5 shadow-sm";
    if (status === SLOT_STATUS.AVAILABLE) {
      return (
        <div className={`${baseStyles} bg-emerald-500 border-emerald-600 text-white`}>
          <div className="flex items-center gap-1">
            <CheckCircle2 size={16} strokeWidth={3} />
            <span className="text-[11px] font-black tracking-tighter">{label} 空きあり</span>
          </div>
        </div>
      );
    }
    if (status === SLOT_STATUS.UNAVAILABLE) {
      return (
        <div className={`${baseStyles} bg-rose-100 border-rose-200 text-rose-600`}>
          <div className="flex items-center gap-1">
            <XCircle size={16} strokeWidth={3} />
            <span className="text-[11px] font-black tracking-tighter">{label} 空きなし</span>
          </div>
        </div>
      );
    }
    return (
      <div className={`${baseStyles} bg-white border-slate-200 text-slate-400 border-dashed`}>
        <span className="text-[10px] font-bold opacity-60">{label} 未設定</span>
      </div>
    );
  };

  const renderMonth = (year, month, isLast) => {
    const days = getDaysInMonth(year, month);
    return (
      <div key={`${year}-${month}`} ref={isLast ? lastMonthElementRef : null} className="mb-10 bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center text-slate-800">
          <h2 className="text-xl font-bold">{year}年 {month + 1}月</h2>
        </div>
        
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
            <div key={d} className={`py-2 text-center text-xs font-black ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} className="h-32 sm:h-40 border-b border-r border-slate-100 bg-slate-50/20" />;
            const dateStr = date.toISOString().split('T')[0];
            const isSunday = date.getDay() === 0;
            const isSaturday = date.getDay() === 6;
            const holidayName = holidays[dateStr];
            const isDefaultClosed = isSunday || !!holidayName;
            const dayData = schedule[dateStr] || { am: SLOT_STATUS.NONE, pm: SLOT_STATUS.NONE, isClosed: false };
            const isEffectivelyClosed = isDefaultClosed || dayData.isClosed;

            return (
              <div 
                key={dateStr}
                className={`group relative h-32 sm:h-40 border-b border-r border-slate-100 flex flex-col transition-colors
                  ${isSunday ? 'bg-red-50/30' : ''} 
                  ${isSaturday ? 'bg-blue-50/30' : ''}
                  ${isEffectivelyClosed ? 'bg-slate-50' : 'bg-white'}
                `}
              >
                <div className="p-2 pb-1 flex flex-col">
                  <span className={`text-sm font-black leading-none ${holidayName || isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-slate-700'}`}>
                    {date.getDate()}
                  </span>
                  {holidayName && <span className="text-[9px] text-red-500 font-black leading-tight mt-0.5 truncate">{holidayName}</span>}
                </div>

                <div className="flex-1 flex flex-col p-1 gap-1">
                  {isEffectivelyClosed ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                      <HangingSignIcon active={true} className="w-16 h-16 animate-in zoom-in duration-300" />
                    </div>
                  ) : (
                    <React.Fragment>
                      <button onClick={() => toggleSlotStatus(dateStr, 'am')} disabled={!isEditMode} className={`flex-1 flex ${!isEditMode ? 'cursor-default' : 'active:scale-95'}`}>
                        <SlotDisplay status={dayData.am} label="AM" />
                      </button>
                      <button onClick={() => toggleSlotStatus(dateStr, 'pm')} disabled={!isEditMode} className={`flex-1 flex ${!isEditMode ? 'cursor-default' : 'active:scale-95'}`}>
                        <SlotDisplay status={dayData.pm} label="PM" />
                      </button>
                    </React.Fragment>
                  )}
                </div>

                {isEditMode && !isDefaultClosed && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleRegularHoliday(dateStr); }}
                    className={`absolute bottom-1 right-1 p-1 rounded-lg transition-all z-10
                      ${dayData.isClosed ? 'bg-slate-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200 opacity-0 group-hover:opacity-100 hover:bg-slate-50 hover:text-slate-600'}`}
                  >
                    <HangingSignIcon active={dayData.isClosed} className="w-6 h-6" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-500 gap-2">
        <Loader2 size={24} className="animate-spin" />
        <span className="font-bold">カレンダーを読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-900">
      {/* Password Modal */}
      {showPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3 text-indigo-600">
                  <KeyRound size={24} />
                  <h3 className="text-xl font-black">管理者パスワード</h3>
                </div>
                <button onClick={() => setShowPassModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handlePassConfirm} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Password</label>
                  <input 
                    type="password" 
                    value={passInput}
                    onChange={(e) => {
                      setPassInput(e.target.value);
                      setPassError(false);
                    }}
                    autoFocus
                    placeholder="パスワードを入力"
                    className={`w-full px-4 py-3 rounded-xl border-2 transition-all outline-none text-center text-lg font-bold tracking-widest
                      ${passError ? 'border-rose-400 bg-rose-50 text-rose-600 animate-pulse' : 'border-slate-100 bg-slate-50 focus:border-indigo-500'}`}
                  />
                  {passError && <p className="text-rose-500 text-xs font-bold mt-2 ml-1">パスワードが正しくありません。</p>}
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95"
                >
                  編集を有効化する
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-indigo-600">
                <Calendar size={32} strokeWidth={2.5} />
                <h1 className="text-3xl font-black tracking-tighter italic">BUSINESS CALENDAR</h1>
              </div>
              <div className="text-slate-500 text-sm font-bold flex items-center gap-2">
                {isEditMode ? (
                  <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    <Unlock size={14} /> 編集モード：有効（自動保存中）
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded border border-slate-200">
                    <Lock size={14} /> 閲覧モード：保護されています
                  </span>
                )}
              </div>
            </div>
            
            <button 
              onClick={handleEditToggle}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-black text-sm shadow-lg transition-all active:scale-95
                ${isEditMode ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              {isEditMode ? (
                <span className="flex items-center gap-2"><Lock size={18} /> 編集を終了する</span>
              ) : (
                <span className="flex items-center gap-2"><Unlock size={18} /> 編集を有効にする</span>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-white px-5 py-4 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs font-black">
              <CheckCircle2 size={16} strokeWidth={3} /> <span>空きあり</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-black">
              <XCircle size={16} strokeWidth={3} /> <span>空きなし</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-black text-slate-500">
              <HangingSignIcon active={true} className="w-6 h-6" /> <span>定休日</span>
            </div>
            <div className="flex-1 flex justify-end gap-2">
              {saving && (
                <span className="text-xs text-indigo-500 font-bold flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> 保存中...
                </span>
              )}
              {isEditMode && (
                <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-400 text-xs font-bold transition-all border border-slate-100">
                  <Trash2 size={14} /> 全リセット
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="space-y-4">
          {months.map((m, idx) => renderMonth(m.year, m.month, idx === months.length - 1))}
          <div className="flex flex-col items-center justify-center py-10 text-slate-300">
            <ChevronDown size={32} className="animate-bounce" />
            <span className="text-xs font-bold tracking-widest uppercase italic text-center">
              Scroll to see more months<br/>
              <span className="text-[10px]">Automatic Cloud Sync Active</span>
            </span>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;