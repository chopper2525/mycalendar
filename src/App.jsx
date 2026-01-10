import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Trash2, CheckCircle2, XCircle, Lock, Unlock, Loader2, KeyRound, X, AlertTriangle, ChevronDown, Store, Tag, Smartphone, ExternalLink, Home } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

/**
 * アプリケーション設定 & バージョン情報
 * v3.7.5: 画面中央配置のレイアウト構造を最終強化
 */
const APP_VERSION = "3.7.5";
const UPDATE_DATE = "2026.01.10";

// Firebaseの設定
const firebaseConfig = {
  apiKey: "AIzaSyDPTVv48gCD0HdjjSBAoRMxo6hm6btGbKY",
  authDomain: "mycalendar-3c583.firebaseapp.com",
  projectId: "mycalendar-3c583",
  storageBucket: "mycalendar-3c583.firebasestorage.app",
  messagingSenderId: "270183106668",
  appId: "1:270183106668:web:70b0b2e783ac08577bb049",
  measurementId: "G-M2FHT3HR5Q"
};

// IDを固定
const appId = "my-calendar-id";

// 初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * ユーティリティ
 */
const toLocalDateString = (date) => {
  if (!(date instanceof Date)) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getJapaneseHolidays = (year) => {
  const holidays = {};
  const add = (date, name) => { holidays[toLocalDateString(date)] = name; };
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
  const getHappyMonday = (month, nth) => {
    const firstDay = new Date(year, month, 1);
    const firstMonday = 1 + (1 - firstDay.getDay() + 7) % 7;
    return new Date(year, month, firstMonday + (nth - 1) * 7);
  };
  add(getHappyMonday(0, 2), "成人の日");
  add(getHappyMonday(6, 3), "海の日");
  add(getHappyMonday(8, 3), "敬老の日");
  add(getHappyMonday(9, 2), "スポーツの日");
  const equinoxSpring = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(new Date(year, 2, equinoxSpring), "春分の日");
  const equinoxAutumn = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  add(new Date(year, 8, equinoxAutumn), "秋分の日");
  return holidays;
};

const HolidayIcon = ({ active }) => (
  <div className={`flex items-center justify-center border rounded-full transition-all duration-300 
    ${active ? 'bg-white border-red-300 text-red-500 shadow-sm scale-110' : 'bg-white border-slate-100 opacity-20'}
    w-6 h-6 sm:w-8 sm:h-8`}>
    <span className="text-[10px] sm:text-xs font-black">休</span>
  </div>
);

const SLOT_STATUS = { NONE: 'none', AVAILABLE: 'available', UNAVAILABLE: 'unavailable' };

export default function App() {
  const [months, setMonths] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [holidays, setHolidays] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [todayStr, setTodayStr] = useState("");

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setErrorMsg(`認証エラー: ${err.message}`);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => { 
      setUser(u);
      if (u) setErrorMsg(null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state');
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setSchedule(snap.data().schedule || {});
      }
      setLoading(false);
    }, (err) => {
      setErrorMsg(`読み取りエラー: ${err.message}`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const today = new Date();
    setTodayStr(toLocalDateString(today));
    const ms = [];
    const allHolidays = {};
    for (let i = 0; i < 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      ms.push({ year: d.getFullYear(), month: d.getMonth() });
      Object.assign(allHolidays, getJapaneseHolidays(d.getFullYear()));
    }
    setMonths(ms);
    setHolidays(allHolidays);
  }, []);

  const saveToCloud = async (ns) => {
    if (!user || !isEditMode) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state');
      await setDoc(docRef, { schedule: ns, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const SlotDisplay = ({ status, label }) => {
    const base = "flex-1 rounded-xl border flex items-center justify-center transition-all mx-0.5 my-0 shadow-sm min-h-[30px] sm:min-h-[36px] px-1";
    if (status === SLOT_STATUS.AVAILABLE) return (
      <div className={`${base} bg-emerald-500 border-emerald-600 text-white`}>
        <div className="flex items-center justify-center gap-1 w-full text-center">
          <CheckCircle2 size={12} className="shrink-0 sm:w-[14px] sm:h-[14px]" strokeWidth={3} />
          <span className="text-[9.5px] sm:text-xs font-black truncate">{label} 〇</span>
        </div>
      </div>
    );
    if (status === SLOT_STATUS.UNAVAILABLE) return (
      <div className={`${base} bg-rose-100 border-rose-300 text-rose-600`}>
        <div className="flex items-center justify-center gap-1 w-full text-center">
          <XCircle size={12} className="shrink-0 sm:w-[14px] sm:h-[14px]" strokeWidth={3} />
          <span className="text-[9.5px] sm:text-xs font-black truncate">{label} ✕</span>
        </div>
      </div>
    );
    return (
      <div className={`${base} bg-white border-slate-200 border-dashed text-slate-400 opacity-40`}>
        <span className="text-[9.5px] sm:text-xs font-black">{label} -</span>
      </div>
    );
  };

  if (errorMsg) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="bg-white p-10 rounded-3xl shadow-xl border-t-8 border-rose-500 max-w-md w-full text-center">
        <h2 className="text-rose-600 font-black text-2xl mb-4 flex items-center justify-center gap-2"><AlertTriangle size={32} /> エラー</h2>
        <p className="text-base text-slate-700 font-bold mb-8">{String(errorMsg)}</p>
        <button onClick={() => window.location.reload()} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-lg">再読み込み</button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4 text-indigo-600">
        <Loader2 className="animate-spin" size={48} strokeWidth={3} />
        <span className="font-black text-slate-400 tracking-widest uppercase text-xs">Initializing v{APP_VERSION}...</span>
      </div>
    </div>
  );

  return (
    /* 中央配置の最終強化: 
      justify-center を設定し、横幅を w-screen (全画面) に固定することで、
      中身の max-w-3xl コンテナを確実に真ん中へ誘導します。
    */
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 w-full flex justify-center overflow-x-hidden">
      <style>{`
        .bg-stripes {
          background-image: linear-gradient(45deg, #fee2e2 25%, transparent 25%, transparent 50%, #fee2e2 50%, #fee2e2 75%, transparent 75%, transparent);
          background-size: 10px 10px;
        }
      `}</style>

      {showPassModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[40px] w-full max-w-sm shadow-2xl text-center animate-in zoom-in duration-300">
            <h3 className="text-2xl font-black mb-6 text-indigo-700 flex items-center gap-3 justify-center"><KeyRound size={28}/> 認証</h3>
            <form onSubmit={e => { e.preventDefault(); if(passInput==="0120"){ setIsEditMode(true); setShowPassModal(false); } }}>
              <input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)} autoFocus placeholder="••••" className="w-full p-4 border-4 rounded-2xl text-center text-2xl font-black mb-6 outline-none transition-all border-slate-100 bg-slate-50 focus:border-indigo-500" />
              <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition-all mb-3">ログイン</button>
              <button type="button" onClick={()=>setShowPassModal(false)} className="w-full text-slate-400 font-black text-sm uppercase tracking-widest">Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* カレンダー本体のコンテナ: mx-auto で左右均等を保証 */}
      <div className="w-full max-w-3xl mx-auto p-2 sm:p-6 md:p-8 lg:p-12 flex flex-col">
        
        <header className="mb-4 w-full flex flex-row justify-between items-center bg-white py-2 px-4 sm:px-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 text-indigo-600 shrink-0">
            <Calendar size={20} strokeWidth={2.5} />
            <div className="flex flex-col">
              <h1 className="text-sm sm:text-xl font-thin tracking-tighter italic uppercase leading-none">Whale Calendar</h1>
              <div className="flex items-center gap-1 mt-1 opacity-40">
                <Tag size={8} />
                <span className="text-[8px] font-black tracking-widest uppercase">{APP_VERSION}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 hidden sm:flex justify-center">
            <a href="https://www.whale39.net/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-black text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
              <Home size={14} />
              <span>公式サイトへ戻る</span>
              <ExternalLink size={10} className="opacity-50" />
            </a>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a href="https://www.whale39.net/" target="_blank" rel="noopener noreferrer" className="sm:hidden text-slate-400 hover:text-indigo-600 transition-colors p-2">
              <Home size={18} />
            </a>
            {saving && <span className="text-[8px] text-indigo-500 font-black animate-pulse uppercase">SAVING</span>}
            <button onClick={() => isEditMode ? setIsEditMode(false) : setShowPassModal(true)} className={`px-3 py-1 rounded-lg font-black text-[9px] sm:text-xs shadow-sm transition-all active:scale-95 ${isEditMode ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white'}`}>
              {isEditMode ? '編集終了' : '編集モード'}
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 gap-12 w-full">
          {months.map(({year, month}, mi) => {
            const first = new Date(year, month, 1);
            const days = [];
            for (let i = 0; i < first.getDay(); i++) days.push(null);
            const d = new Date(first);
            while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
            const rY = year - 2018; const hY = year - 1988; const sY = year - 1925;
            return (
              <div key={`${year}-${month}-${mi}`} className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden w-full">
                <div className="bg-slate-50 px-6 sm:px-10 py-5 border-b font-black text-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-baseline gap-2 sm:gap-4">
                    <span className="text-xl sm:text-2xl">{String(year)}年 { String(month + 1) }月</span>
                    <span className="text-[9.5px] sm:text-sm text-slate-400 font-bold tracking-tight uppercase">
                      (令和{rY}年 / 平成{hY}年 / 昭和{sY}年)
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto">
                    <div className="flex items-center gap-1 text-[9.5px] sm:text-xs font-bold whitespace-nowrap">
                      <span className="text-emerald-600 text-sm sm:text-base">〇</span>
                      <span className="text-slate-400 font-black">＝空きあり</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9.5px] sm:text-xs font-bold whitespace-nowrap">
                      <span className="text-rose-500 text-sm sm:text-base">✕</span>
                      <span className="text-slate-400 font-black">＝空きなし</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9.5px] sm:text-xs font-bold whitespace-nowrap">
                      <span className="text-sm sm:text-base">📱</span>
                      <span className="text-slate-400 font-black">＝スマホクラス</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-7 text-center text-[9.5px] sm:text-xs font-black uppercase py-3 border-b bg-slate-50/50 tracking-[0.1em] sm:tracking-[0.2em]">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((name, i) => (
                    <div key={`${name}-${mi}`} className={i===0?'text-red-500':i===6?'text-blue-500':'text-slate-500'}>{String(name)}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((day, i) => {
                    if (!day) return <div key={`empty-${mi}-${i}`} className="h-[76px] sm:h-[130px] border-b border-r border-slate-50 bg-slate-50/10" />;
                    const ds = toLocalDateString(day);
                    const hol = holidays[ds];
                    const sun = day.getDay() === 0;
                    const wed = day.getDay() === 3;
                    const data = schedule[ds] || { am: 'none', pm: 'none', isClosed: false };
                    const isClosed = data.isClosed || sun || !!hol;
                    const isSmartphoneClass = wed && !hol;
                    const isToday = ds === todayStr;
                    return (
                      <div key={ds} className={`h-[76px] sm:h-[130px] border-b border-r border-slate-50 p-1 sm:p-2 flex flex-col relative transition-colors group
                        ${isClosed ? 'bg-red-50 bg-stripes' : isToday ? 'bg-yellow-50' : sun ? 'bg-red-50/10' : ''}`}>
                        <div className="flex flex-col mb-1 overflow-hidden px-1">
                          <span className={`text-sm sm:text-base font-black leading-none ${sun || hol ? 'text-red-600' : 'text-slate-600'}`}>
                            {day.getDate()}
                            {isToday && <span className="ml-1 text-[6.5px] sm:text-[10px] text-yellow-600 uppercase tracking-tighter font-black">Today</span>}
                          </span>
                          {hol && (
                            <span className="text-[7px] sm:text-[9px] text-red-500 font-black leading-tight truncate bg-red-100/50 px-1 rounded mt-1">{String(hol)}</span>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col gap-0 justify-center py-0.5 sm:py-1 px-1">
                          {isClosed ? (
                            <div className="flex justify-center items-center w-full animate-in zoom-in duration-300">
                              <HolidayIcon active={true} />
                            </div>
                          ) : isSmartphoneClass ? (
                            <div className="flex flex-col items-center justify-center w-full h-full animate-in fade-in duration-500">
                              <div className="bg-sky-500 text-white px-1 sm:px-2 py-1 sm:py-1.5 rounded-full flex items-center justify-center gap-1 shadow-sm border border-sky-600 overflow-hidden min-w-[24px]">
                                <Smartphone size={11} strokeWidth={2.5} className="shrink-0 hidden sm:block" />
                                <span className="text-[7.5px] sm:text-[10px] font-black tracking-tighter whitespace-nowrap">
                                  <span className="sm:hidden text-base">📱</span>
                                  <span className="hidden sm:inline">スマホクラス</span>
                                </span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => {
                                if(!isEditMode) return;
                                const next = data.am==='none'?'available':data.am==='available'?'unavailable':'none';
                                const ns = {...schedule, [ds]:{...data, am:next}};
                                setSchedule(ns); saveToCloud(ns);
                              }} disabled={!isEditMode} className="flex flex-1 min-h-0"><SlotDisplay status={data.am} label="午前" /></button>
                              <button onClick={() => {
                                if(!isEditMode) return;
                                const next = data.pm==='none'?'available':data.pm==='available'?'unavailable':'none';
                                const ns = {...schedule, [ds]:{...data, pm:next}};
                                setSchedule(ns); saveToCloud(ns);
                              }} disabled={!isEditMode} className="flex flex-1 min-h-0"><SlotDisplay status={data.pm} label="午後" /></button>
                            </>
                          )}
                        </div>
                        {isEditMode && !sun && !hol && (
                          <button onClick={() => {
                              const ns = {...schedule, [ds]:{...data, isClosed: !data.isClosed}};
                              setSchedule(ns); saveToCloud(ns);
                            }} className={`absolute bottom-0.5 right-0.5 sm:bottom-1.5 sm:right-1.5 p-1 rounded transition-all z-10 opacity-0 group-hover:opacity-100
                            ${data.isClosed ? 'bg-red-500 text-white opacity-100 shadow-md' : 'bg-white text-slate-300 border border-slate-100 hover:text-red-500'}`}>
                            <Store size={12} className="sm:size-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </main>
        <footer className="mt-12 mb-16 text-center border-t border-slate-100 pt-8 w-full">
          <div className="inline-flex flex-col items-center gap-3 text-slate-300">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9.5px] font-black tracking-widest uppercase italic text-slate-400 underline decoration-slate-200">Stable Build v{APP_VERSION}</span>
              <span className="text-[7.5px] font-bold text-slate-300 uppercase">Released: {UPDATE_DATE}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}