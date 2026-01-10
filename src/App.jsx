import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Trash2, CheckCircle2, XCircle, Lock, Unlock, Loader2, KeyRound, X, AlertTriangle, ChevronDown, Store } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

/**
 * Firebaseの設定
 */
const firebaseConfig = {
  apiKey: "AIzaSyDPTVv48gCD0HdjjSBAoRMxo6hm6btGbKY",
  authDomain: "mycalendar-3c583.firebaseapp.com",
  projectId: "mycalendar-3c583",
  storageBucket: "mycalendar-3c583.firebasestorage.app",
  messagingSenderId: "270183106668",
  appId: "1:270183106668:web:70b0b2e783ac08577bb049",
  measurementId: "G-M2FHT3HR5Q"
};

const appId = "my-calendar-id";

/**
 * 日付オブジェクトを "YYYY-MM-DD" 形式の文字列（ローカル時間）に変換するヘルパー
 */
const toLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * 日本の祝日計算ロジック
 */
const getJapaneseHolidays = (year) => {
  const holidays = {};
  const add = (date, name) => {
    holidays[toLocalDateString(date)] = name;
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

  Object.keys(holidays).forEach(dateKey => {
    const d = new Date(dateKey);
    if (d.getDay() === 0) { 
      const nextDay = new Date(d);
      nextDay.setDate(d.getDate() + 1);
      const nextKey = toLocalDateString(nextDay);
      if (!holidays[nextKey]) holidays[nextKey] = "振替休日";
      else {
        const nextNextDay = new Date(d);
        nextNextDay.setDate(d.getDate() + 2);
        holidays[toLocalDateString(nextNextDay)] = "振替休日";
      }
    }
  });

  return holidays;
};

/**
 * 定休日アイコン
 */
const HolidayIcon = ({ active, className }) => (
  <div className={`relative flex flex-col items-center justify-center ${className}`}>
    <div className={`w-full h-1.5 mb-1 rounded-full ${active ? 'bg-slate-500' : 'bg-slate-200'}`} />
    <div className={`relative p-3 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-1
      ${active ? 'bg-slate-100 border-slate-400 shadow-inner scale-110' : 'bg-white border-slate-100 opacity-30'}`}>
      <Store size={28} className={active ? 'text-slate-600' : 'text-slate-300'} />
      <span className={`text-xs font-black tracking-tighter leading-none
        ${active ? 'text-slate-700' : 'text-slate-300'}`}>定休日</span>
    </div>
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
  const [passError, setPassError] = useState(false);

  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      signInAnonymously(auth).catch(err => setErrorMsg(`認証エラー: ${err.message}`));
      const unsubscribe = onAuthStateChanged(auth, (u) => { 
        setUser(u); 
        setLoading(false); 
      });
      return () => unsubscribe();
    } catch (e) {
      setErrorMsg("初期化失敗: " + e.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const db = getFirestore();
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) setSchedule(snap.data().schedule || {});
    }, (err) => {
      setErrorMsg("読み取りエラー: " + err.message);
    });
  }, [user]);

  useEffect(() => {
    const today = new Date();
    const ms = [];
    const allHolidays = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const year = d.getFullYear();
      ms.push({ year, month: d.getMonth() });
      if (!allHolidays[year]) Object.assign(allHolidays, getJapaneseHolidays(year));
    }
    setMonths(ms);
    setHolidays(allHolidays);
  }, []);

  const saveToCloud = async (ns) => {
    if (!user || !isEditMode) return;
    setSaving(true);
    try {
      const db = getFirestore();
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state'), { 
        schedule: ns, 
        updatedAt: new Date().toISOString() 
      });
    } catch (err) { console.error(err); } 
    finally { setSaving(false); }
  };

  const SlotDisplay = ({ status, label }) => {
    const base = "flex-1 rounded-xl border-2 flex items-center justify-center transition-all m-0.5 shadow-sm min-h-[44px]";
    if (status === SLOT_STATUS.AVAILABLE) return (
      <div className={`${base} bg-emerald-500 border-emerald-600 text-white`}>
        <CheckCircle2 size={18} className="mr-1.5" strokeWidth={3} /><span className="text-xs font-black">{label} 空きあり</span>
      </div>
    );
    if (status === SLOT_STATUS.UNAVAILABLE) return (
      <div className={`${base} bg-rose-100 border-rose-300 text-rose-600`}>
        <XCircle size={18} className="mr-1.5" strokeWidth={3} /><span className="text-xs font-black">{label} 空きなし</span>
      </div>
    );
    return (
      <div className={`${base} bg-white border-slate-200 border-dashed text-slate-400`}>
        <span className="text-xs font-black opacity-40">{label} -</span>
      </div>
    );
  };

  if (errorMsg) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="bg-white p-10 rounded-3xl shadow-xl border-t-8 border-rose-500 max-w-md w-full text-center">
        <h2 className="text-rose-600 font-black text-2xl mb-4 flex items-center justify-center gap-2"><AlertTriangle size={32} /> エラー</h2>
        <p className="text-base text-slate-700 font-bold mb-8">{errorMsg}</p>
        <button onClick={() => window.location.reload()} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-lg">再読み込み</button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={48} strokeWidth={3} />
        <span className="font-black text-slate-400 tracking-widest uppercase">Initializing...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <style>{`
        .bg-stripes {
          background-image: linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 50%, #f1f5f9 50%, #f1f5f9 75%, transparent 75%, transparent);
          background-size: 12px 12px;
        }
      `}</style>

      {showPassModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[40px] w-full max-w-sm shadow-2xl">
            <h3 className="text-2xl font-black mb-6 flex items-center gap-3 text-indigo-700"><KeyRound size={28}/> パスワード入力</h3>
            <form onSubmit={e => { e.preventDefault(); if(passInput==="0120"){ setIsEditMode(true); setShowPassModal(false); } else { setPassError(true); } }}>
              <input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)} autoFocus placeholder="••••" className={`w-full p-4 border-4 rounded-2xl text-center text-2xl font-black mb-6 outline-none transition-all ${passError?'border-rose-400 bg-rose-50 text-rose-600':'border-slate-100 bg-slate-50 focus:border-indigo-400'}`} />
              <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-xl shadow-xl shadow-indigo-200 active:scale-95 transition-all mb-3">ログイン</button>
              <button type="button" onClick={()=>setShowPassModal(false)} className="w-full text-slate-400 font-black text-sm uppercase tracking-widest hover:text-slate-600">Cancel</button>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center w-full min-h-screen p-4 md:p-10 lg:p-16">
        <div className="w-full max-w-6xl">
          {/* ヘッダー：高さを極力低く(py-2) マージンも縮小(mb-4) */}
          <header className="mb-4 flex flex-col md:flex-row justify-between items-center bg-white py-2 px-4 md:px-6 rounded-2xl shadow-sm border border-slate-100 gap-2">
            <div className="flex items-center gap-2 text-indigo-600">
              <Calendar size={18} strokeWidth={2.5} />
              {/* タイトル：極細かつコンパクト */}
              <h1 className="text-lg font-thin tracking-tighter italic uppercase leading-none">Whale Calendar</h1>
            </div>
            <div className="flex items-center gap-3">
              {saving && <span className="text-[9px] text-indigo-500 font-black animate-pulse uppercase tracking-widest">Saving...</span>}
              {/* 編集ボタン：極小サイズ */}
              <button onClick={() => isEditMode ? setIsEditMode(false) : setShowPassModal(true)} className={`px-3 py-1 rounded-lg font-black text-[10px] shadow-sm transition-all active:scale-95 ${isEditMode ? 'bg-slate-900 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                {isEditMode ? '編集終了' : '編集モード'}
              </button>
            </div>
          </header>

          <main className="grid grid-cols-1 gap-12">
            {months.map(({year, month}) => {
              const first = new Date(year, month, 1);
              const days = [];
              for (let i = 0; i < first.getDay(); i++) days.push(null);
              const d = new Date(first);
              while (d.getMonth() === month) { 
                days.push(new Date(d)); 
                d.setDate(d.getDate() + 1); 
              }

              // 和暦計算
              const reiwaYear = year - 2018;
              const heiseiYear = year - 1988;
              const showaYear = year - 1925;

              return (
                <div key={`${year}-${month}`} className="bg-white rounded-[48px] shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-10 py-6 border-b font-black text-slate-800 flex items-baseline gap-4">
                    <span className="text-3xl">{year}年 { month + 1 }月</span>
                    <span className="text-sm text-slate-400 font-bold uppercase tracking-tight">
                      (令和{reiwaYear}年 / 平成{heiseiYear}年 / 昭和{showaYear}年)
                    </span>
                  </div>
                  <div className="grid grid-cols-7 text-center text-sm font-black uppercase py-4 border-b bg-slate-50/50 tracking-[0.2em]">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((name, i) => (
                      <div key={name} className={i===0?'text-red-500':i===6?'text-blue-500':'text-slate-400'}>{name}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {days.map((day, i) => {
                      if (!day) return <div key={i} className="h-40 sm:h-48 border-b border-r border-slate-100 bg-slate-50/10" />;
                      const ds = toLocalDateString(day);
                      const hol = holidays[ds];
                      const sun = day.getDay() === 0;
                      const sat = day.getDay() === 6;
                      const data = schedule[ds] || { am: 'none', pm: 'none', isClosed: false };
                      const isClosed = data.isClosed || sun || !!hol;

                      return (
                        <div key={ds} className={`h-40 sm:h-48 border-b border-r border-slate-100 p-3 flex flex-col relative transition-colors group
                          ${sun ? 'bg-red-50/10' : ''} ${isClosed ? 'bg-stripes' : ''}`}>
                          <div className="flex flex-col mb-3">
                            <span className={`text-lg font-black ${sun || hol ? 'text-red-600' : 'text-slate-600'}`}>{day.getDate()}</span>
                            {hol && <span className="text-xs text-red-500 font-black leading-tight truncate mt-1 bg-red-50 px-1.5 py-0.5 rounded-md inline-block self-start">{hol}</span>}
                          </div>
                          <div className="flex-1 flex flex-col gap-2 justify-center py-1">
                            {isClosed ? (
                              <div className="flex justify-center">
                                <HolidayIcon active={true} className="w-20 h-20 sm:w-24 sm:h-24" />
                              </div>
                            ) : (
                              <>
                                <button onClick={() => {
                                  if(!isEditMode) return;
                                  const next = data.am==='none'?'available':data.am==='available'?'unavailable':'none';
                                  const ns = {...schedule, [ds]:{...data, am:next}};
                                  setSchedule(ns); saveToCloud(ns);
                                }} disabled={!isEditMode} className="flex flex-1"><SlotDisplay status={data.am} label="AM" /></button>
                                <button onClick={() => {
                                  if(!isEditMode) return;
                                  const next = data.pm==='none'?'available':data.pm==='available'?'unavailable':'none';
                                  const ns = {...schedule, [ds]:{...data, pm:next}};
                                  setSchedule(ns); saveToCloud(ns);
                                }} disabled={!isEditMode} className="flex flex-1"><SlotDisplay status={data.pm} label="PM" /></button>
                              </>
                            )}
                          </div>
                          {isEditMode && !sun && !hol && (
                            <button 
                              title="定休日の切り替え"
                              onClick={() => {
                                const ns = {...schedule, [ds]:{...data, isClosed: !data.isClosed}};
                                setSchedule(ns); saveToCloud(ns);
                              }} className={`absolute bottom-3 right-3 p-3 rounded-2xl transition-all z-10 shadow-lg
                              ${data.isClosed ? 'bg-slate-800 text-white scale-110' : 'bg-white text-slate-300 border-2 border-slate-100 opacity-0 group-hover:opacity-100 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300'}`}>
                              <Store size={22} strokeWidth={2.5} />
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
          
          <footer className="mt-20 mb-24 text-center">
            <div className="inline-flex flex-col items-center gap-4 text-slate-300">
              <ChevronDown size={40} className="animate-bounce" strokeWidth={3} />
              <span className="text-sm font-black tracking-[0.3em] uppercase italic">Whale Calendar Engine v2.0</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}