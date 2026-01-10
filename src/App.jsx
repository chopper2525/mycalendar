import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Trash2, CheckCircle2, XCircle, Lock, Unlock, Loader2, KeyRound, X, AlertTriangle, ChevronDown } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

/**
 * 【修正済み】Firebaseの設定
 * 全角スペースを取り除き、正しい形式に修正しました。
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

// 祝日計算
const getJapaneseHolidays = (year) => {
  const holidays = {};
  const add = (date, name) => { holidays[date.toISOString().split('T')[0]] = name; };
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
  return holidays;
};

const HangingSignIcon = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M8 2L4 7M16 2L20 7" strokeWidth="1" />
    <rect x="2" y="7" width="20" height="13" rx="1.5" fill={active ? "currentColor" : "white"} />
    <text x="12" y="14.5" dominantBaseline="middle" textAnchor="middle" fontSize="4.5" fontWeight="900" fill={active ? "white" : "currentColor"}>定休日</text>
  </svg>
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
  const observer = useRef();

  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      
      signInAnonymously(auth).catch(err => {
        console.error("Auth error:", err);
        setErrorMsg(`Firebase認証エラー: ${err.message}\n(Firebaseコンソールで「匿名認証」を有効にしてください)`);
      });

      const unsubscribe = onAuthStateChanged(auth, (u) => { 
        setUser(u); 
        setLoading(false); 
      });
      return () => unsubscribe();
    } catch (e) {
      setErrorMsg("Firebase初期化失敗: " + e.message);
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
      setErrorMsg("データ読み込みエラー: " + err.message + "\n(Firestoreの「ルール」を確認してください)");
    });
  }, [user]);

  useEffect(() => {
    const today = new Date();
    const ms = [];
    const allHolidays = {};
    for (let i = 0; i < 4; i++) {
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
      const db = getFirestore();
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state'), { 
        schedule: ns, 
        updatedAt: new Date().toISOString() 
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const SlotDisplay = ({ status, label }) => {
    const base = "flex-1 rounded-md border flex items-center justify-center transition-all m-0.5 shadow-sm min-h-[36px]";
    if (status === SLOT_STATUS.AVAILABLE) return (
      <div className={`${base} bg-emerald-500 border-emerald-600 text-white`}>
        <CheckCircle2 size={14} className="mr-1" /><span className="text-[10px] font-black">{label} 空きあり</span>
      </div>
    );
    if (status === SLOT_STATUS.UNAVAILABLE) return (
      <div className={`${base} bg-rose-100 border-rose-200 text-rose-600`}>
        <XCircle size={14} className="mr-1" /><span className="text-[10px] font-black">{label} 空きなし</span>
      </div>
    );
    return (
      <div className={`${base} bg-white border-slate-100 border-dashed text-slate-300`}>
        <span className="text-[10px] font-bold">{label} 未設定</span>
      </div>
    );
  };

  if (errorMsg) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-xl border-t-4 border-rose-500 max-w-md w-full">
        <h2 className="text-rose-500 font-black mb-4 flex items-center gap-2"><AlertTriangle /> エラー発生</h2>
        <pre className="text-xs bg-slate-50 p-4 rounded-lg whitespace-pre-wrap font-mono text-slate-600 mb-6">{errorMsg}</pre>
        <button onClick={() => window.location.reload()} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold">再読み込み</button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Loader2 className="animate-spin text-indigo-600" size={32} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      {showPassModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm shadow-2xl">
            <h3 className="font-black mb-4 flex items-center gap-2"><KeyRound size={20}/> パスワード入力 (0120)</h3>
            <form onSubmit={e => { e.preventDefault(); if(passInput==="0120"){ setIsEditMode(true); setShowPassModal(false); } else { setPassError(true); } }}>
              <input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)} autoFocus className={`w-full p-3 border-2 rounded-xl text-center text-lg font-bold mb-4 outline-none ${passError?'border-rose-400 bg-rose-50':'border-slate-100'}`} />
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black">ログイン</button>
              <button type="button" onClick={()=>setShowPassModal(false)} className="w-full text-slate-400 mt-2 text-sm">キャンセル</button>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 text-indigo-600">
            <Calendar size={28} strokeWidth={3} />
            <h1 className="text-2xl font-black tracking-tighter italic uppercase">Business Calendar</h1>
          </div>
          <button onClick={() => isEditMode ? setIsEditMode(false) : setShowPassModal(true)} className={`px-5 py-2 rounded-full font-black text-xs shadow-md ${isEditMode ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white'}`}>
            {isEditMode ? '編集を終了する' : '編集モード'}
          </button>
        </header>

        <main className="space-y-6">
          {months.map(({year, month}) => {
            const first = new Date(year, month, 1);
            const days = [];
            for (let i = 0; i < first.getDay(); i++) days.push(null);
            const d = new Date(first);
            while (d.getMonth() === (month % 12)) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }

            return (
              <div key={`${year}-${month}`} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b font-black text-slate-600">{year}年 { (month % 12) + 1 }月</div>
                <div className="grid grid-cols-7 text-center text-[10px] font-black uppercase py-2 border-b bg-slate-50/30">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((name, i) => (
                    <div key={name} className={i===0?'text-red-500':i===6?'text-blue-500':'text-slate-400'}>{name}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((day, i) => {
                    if (!day) return <div key={i} className="h-32 border-b border-r border-slate-50 bg-slate-50/10" />;
                    const ds = day.toISOString().split('T')[0];
                    const sun = day.getDay() === 0;
                    const hol = holidays[ds];
                    const data = schedule[ds] || { am: 'none', pm: 'none', isClosed: false };
                    const isClosed = sun || !!hol || data.isClosed;

                    return (
                      <div key={ds} className={`h-32 border-b border-r border-slate-50 p-1 flex flex-col relative ${sun ? 'bg-red-50/10' : ''}`}>
                        <span className={`text-[10px] font-black ${sun || hol ? 'text-red-500' : 'text-slate-400'}`}>{day.getDate()}</span>
                        <div className="flex-1 flex flex-col gap-1 justify-center py-1">
                          {isClosed ? (
                            <div className="flex justify-center"><HangingSignIcon active={true} className="w-12 h-12 text-slate-300" /></div>
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
                          <button onClick={() => {
                            const ns = {...schedule, [ds]:{...data, isClosed: !data.isClosed}};
                            setSchedule(ns); saveToCloud(ns);
                          }} className="absolute bottom-1 right-1 opacity-40 hover:opacity-100">
                            <HangingSignIcon active={data.isClosed} className="w-5 h-5" />
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
      </div>
    </div>
  );
}