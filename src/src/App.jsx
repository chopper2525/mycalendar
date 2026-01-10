import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Trash2, CheckCircle2, XCircle, Lock, Unlock, Loader2, KeyRound, X, AlertTriangle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

/**
 * 【最重要】ここをご自身の Firebase コンソールの値に書き換えてください。
 * 設定がないと画面に「設定未入力」というエラーが表示されます。
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
 * 祝日計算
 */
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

/**
 * 看板アイコン
 */
const HangingSignIcon = ({ active, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M8 2L4 7M16 2L20 7" strokeWidth="1" />
    <rect x="2" y="7" width="20" height="13" rx="1.5" fill={active ? "currentColor" : "white"} />
    <text x="12" y="14.5" dominantBaseline="middle" textAnchor="middle" fontSize="4.5" fontWeight="900" fill={active ? "white" : "currentColor"}>定休日</text>
  </svg>
);

export default function App() {
  const [months, setMonths] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [holidays, setHolidays] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [passInput, setPassInput] = useState("");
  const [showPassModal, setShowPassModal] = useState(false);
  const [passError, setPassError] = useState(false);

  useEffect(() => {
    // 1. Firebase設定の未入力チェック
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("ここに")) {
      setErrorMsg("Firebaseの設定（firebaseConfig）が入力されていません。App.jsxの冒頭部分を、Firebaseコンソールから取得した自分の設定値に書き換えて保存してください。");
      setLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      
      // 2. 匿名ログインの試行
      signInAnonymously(auth).catch(err => {
        console.error("Login Error:", err);
        setErrorMsg(`Firebaseログイン失敗: ${err.message}\n\n【対策】Firebaseコンソールの「Authentication」メニュー ➔ 「Sign-in method」タブで「匿名 (Anonymous)」を有効にしてください。`);
      });

      const unsubscribe = onAuthStateChanged(auth, (u) => { 
        setUser(u); 
        setLoading(false); 
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Init Error:", e);
      setErrorMsg(`初期化エラー: ${e.message}`);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    try {
      const db = getFirestore();
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state');
      return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setSchedule(docSnap.data().schedule || {});
        }
      }, (err) => {
        console.error("Firestore Error:", err);
        setErrorMsg(`データ読み込み失敗: ${err.message}\n\n【対策】Firestoreの「ルール」が「allow read, write: if true;」（または適切な権限）で公開されているか確認してください。`);
      });
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => {
    const today = new Date();
    const ms = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      ms.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    setMonths(ms);
    setHolidays(getJapaneseHolidays(today.getFullYear()));
  }, []);

  const saveToCloud = async (ns) => {
    if (!user || !isEditMode) return;
    try {
      const db = getFirestore();
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar', 'state');
      await setDoc(docRef, { schedule: ns, updatedAt: new Date().toISOString() });
    } catch (err) { console.error(err); }
  };

  const toggleSlotStatus = (dateStr, slot) => {
    if (!isEditMode) return;
    const data = schedule[dateStr] || { am: 'none', pm: 'none', isClosed: false };
    if (data.isClosed) return;
    const next = data[slot] === 'none' ? 'available' : data[slot] === 'available' ? 'unavailable' : 'none';
    const ns = { ...schedule, [dateStr]: { ...data, [slot]: next } };
    setSchedule(ns);
    saveToCloud(ns);
  };

  const toggleRegularHoliday = (dateStr) => {
    if (!isEditMode) return;
    const data = schedule[dateStr] || { am: 'none', pm: 'none', isClosed: false };
    const ns = { ...schedule, [dateStr]: { ...data, isClosed: !data.isClosed } };
    setSchedule(ns);
    saveToCloud(ns);
  };

  // --- エラー表示画面 ---
  if (errorMsg) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="bg-white p-8 rounded-3xl shadow-2xl border-t-8 border-rose-500 max-w-lg w-full">
        <div className="flex items-center gap-3 text-rose-500 mb-4">
          <AlertTriangle size={32} />
          <h2 className="text-xl font-black">設定エラー</h2>
        </div>
        <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 mb-6 text-rose-700 text-sm font-bold whitespace-pre-wrap leading-relaxed">
          {errorMsg}
        </div>
        <button onClick={() => window.location.reload()} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors">修正後に再読み込み</button>
      </div>
    </div>
  );

  // --- 読み込み中画面 ---
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-3">
      <Loader2 className="animate-spin" size={32} />
      <span className="font-bold tracking-widest uppercase">Calendar Initializing...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900">
      {showPassModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="font-black mb-4 flex items-center gap-2"><KeyRound size={20}/> 管理者パスワード</h3>
            <form onSubmit={e => { e.preventDefault(); if(passInput==="0120"){ setIsEditMode(true); setShowPassModal(false); } else { setPassError(true); } }}>
              <input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)} autoFocus className={`w-full p-3 border-2 rounded-xl text-center text-lg font-bold mb-4 ${passError ? 'border-red-400 bg-red-50' : 'border-slate-100'}`} />
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black shadow-lg">ログイン</button>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 text-indigo-600">
            <Calendar size={32} strokeWidth={2.5} />
            <h1 className="text-3xl font-black italic tracking-tighter uppercase">Business Calendar</h1>
          </div>
          <button onClick={() => isEditMode ? setIsEditMode(false) : setShowPassModal(true)} className={`px-6 py-2.5 rounded-full font-black text-sm shadow-lg ${isEditMode ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white'}`}>
            {isEditMode ? '編集を終了する' : '編集モードを有効にする'}
          </button>
        </header>

        <main className="space-y-8">
          {months.map(({year, month}) => {
            const date = new Date(year, month, 1);
            const days = [];
            for (let i = 0; i < date.getDay(); i++) days.push(null);
            while (date.getMonth() === (month % 12)) {
              days.push(new Date(date));
              date.setDate(date.getDate() + 1);
            }

            return (
              <div key={`${year}-${month}`} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b font-black text-slate-700 text-lg">{year}年 { (month % 12) + 1 }月</div>
                <div className="grid grid-cols-7 text-center text-[10px] font-black uppercase py-2 border-b bg-slate-50/30">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                    <div key={d} className={i===0?'text-red-500':i===6?'text-blue-500':'text-slate-400'}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((day, i) => {
                    if (!day) return <div key={i} className="h-28 border-b border-r border-slate-50 bg-slate-50/10" />;
                    const ds = day.toISOString().split('T')[0];
                    const sun = day.getDay() === 0;
                    const hol = holidays[ds];
                    const data = schedule[ds] || { am: 'none', pm: 'none', isClosed: false };
                    const isClosed = sun || !!hol || data.isClosed;

                    return (
                      <div key={ds} className={`h-28 border-b border-r border-slate-50 p-1 flex flex-col relative ${sun ? 'bg-red-50/20' : ''}`}>
                        <span className={`text-[10px] font-black ${sun || hol ? 'text-red-500' : 'text-slate-400'}`}>{day.getDate()}</span>
                        <div className="flex-1 flex flex-col gap-1 justify-center py-1">
                          {isClosed ? (
                            <div className="flex justify-center"><HangingSignIcon active={true} className="w-10 h-10 text-slate-300" /></div>
                          ) : (
                            <>
                              <button onClick={() => toggleSlotStatus(ds, 'am')} disabled={!isEditMode} className={`flex-1 text-[8px] font-black rounded border transition-all ${data.am==='available'?'bg-emerald-500 text-white border-emerald-600':'text-slate-300 border-slate-100 border-dashed'}`}>AM {data.am==='available'?'◯':data.am==='unavailable'?'×':'-'}</button>
                              <button onClick={() => toggleSlotStatus(ds, 'pm')} disabled={!isEditMode} className={`flex-1 text-[8px] font-black rounded border transition-all ${data.pm==='available'?'bg-emerald-500 text-white border-emerald-600':'text-slate-300 border-slate-100 border-dashed'}`}>PM {data.pm==='available'?'◯':data.pm==='unavailable'?'×':'-'}</button>
                            </>
                          )}
                        </div>
                        {isEditMode && !sun && !hol && (
                          <button onClick={() => toggleRegularHoliday(ds)} className="absolute bottom-1 right-1 opacity-50 hover:opacity-100">
                            <HangingSignIcon active={data.isClosed} className="w-5 h-5 text-slate-400" />
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