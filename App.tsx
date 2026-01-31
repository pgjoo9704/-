
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { MealLog, DailySummary, MealCategory } from './types';
import { 
  CameraIcon, 
  PhotoIcon, 
  ChartBarIcon,
  CalendarDaysIcon,
  TrashIcon,
  HomeIcon,
  ChevronLeftIcon,
  ClockIcon,
  PencilIcon,
  XMarkIcon,
  PencilSquareIcon,
  CheckIcon,
  PlusIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

const MODEL_NAME = 'gemini-3-flash-preview';
const MAX_IMAGE_DIMENSION = 1024; 

const resizeImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_IMAGE_DIMENSION) {
          height *= MAX_IMAGE_DIMENSION / width;
          width = MAX_IMAGE_DIMENSION;
        }
      } else {
        if (height > MAX_IMAGE_DIMENSION) {
          width *= MAX_IMAGE_DIMENSION / height;
          height = MAX_IMAGE_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8)); 
    };
  });
};

const CATEGORY_ICONS: Record<MealCategory, string> = {
  'Breakfast': '🌅',
  'Lunch': '☀️',
  'Dinner': '🌙',
  'Snack': '🍪',
  'Other': '🍴'
};

export default function App() {
  const [meals, setMeals] = useState<MealLog[]>(() => {
    try {
      const saved = localStorage.getItem('protein_meals_v2');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [goal, setGoal] = useState<number>(() => {
    const saved = localStorage.getItem('protein_goal');
    return saved ? parseInt(saved, 10) : 120;
  });

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const [currentView, setCurrentView] = useState<'daily' | 'history'>('daily');
  const [historyPeriod, setHistoryPeriod] = useState<'week' | 'month'>('week');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const goalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('protein_meals_v2', JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    localStorage.setItem('protein_goal', goal.toString());
  }, [goal]);

  const todayStr = new Date().toLocaleDateString('sv-SE');

  const todayMeals = useMemo(() => {
    return meals
      .filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === todayStr)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [meals, todayStr]);

  const todayStats = useMemo(() => {
    return todayMeals.reduce((acc, curr) => ({
      protein: acc.protein + curr.proteinGrams,
    }), { protein: 0 });
  }, [todayMeals]);

  const progressPercent = Math.min((todayStats.protein / goal) * 100, 100);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const getEncouragement = () => {
    if (todayStats.protein === 0) return "오늘의 첫 단백질을 기록해볼까요? 💪";
    if (todayStats.protein >= goal) return "🎉 목표 달성! 완벽한 하루네요!";
    if (progressPercent > 70) return "거의 다 왔어요! 조금만 더 힘내세요!";
    return "꾸준한 단백질 섭취가 근육 성장의 핵심입니다!";
  };

  const analyzeMeal = async (base64Data?: string, textPrompt?: string) => {
    setIsAnalyzing(true);
    setAnalysisStep('AI가 식단을 분석하고 있습니다...');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const promptParts: any[] = [];
      
      if (base64Data) {
        promptParts.push({ inlineData: { data: base64Data, mimeType: 'image/jpeg' } });
      }
      
      const systemPrompt = `Analyze this meal photo or description. 
      Identify the food items and estimate the total protein content in grams. 
      Also categorize the meal (Breakfast, Lunch, Dinner, Snack, or Other) based on typical timing or food types.
      Respond ONLY in JSON. Use Korean for food names.`;

      promptParts.push({ text: textPrompt ? `${systemPrompt} Input: "${textPrompt}"` : systemPrompt });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts: promptParts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              foodName: { type: Type.STRING },
              proteinGrams: { type: Type.NUMBER },
              category: { 
                type: Type.STRING,
                description: 'One of: Breakfast, Lunch, Dinner, Snack, Other'
              }
            },
            required: ["foodName", "proteinGrams", "category"]
          }
        }
      });

      const result = JSON.parse(response.text);
      const newMeal: MealLog = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        foodName: result.foodName,
        proteinGrams: Math.round(result.proteinGrams),
        category: (result.category as MealCategory) || 'Other',
        imageUrl: base64Data ? `data:image/jpeg;base64,${base64Data}` : undefined
      };
      
      setMeals(prev => [newMeal, ...prev]);
    } catch (error) {
      console.error(error);
      alert("분석 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const resized = await resizeImage(reader.result as string);
      const base64Data = resized.split(',')[1];
      await analyzeMeal(base64Data);
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    const text = manualText;
    setManualText('');
    setIsTextModalOpen(false);
    await analyzeMeal(undefined, text);
  };

  const deleteMeal = (id: string) => {
    if (confirm("이 기록을 삭제하시겠습니까?")) {
      setMeals(prev => prev.filter(m => m.id !== id));
    }
  };

  const toggleEditGoal = () => {
    if (isEditingGoal) {
      setIsEditingGoal(false);
    } else {
      setIsEditingGoal(true);
      setTimeout(() => goalInputRef.current?.focus(), 100);
    }
  };

  const historyData = useMemo(() => {
    if (historyPeriod === 'week') {
      const data: DailySummary[] = [];
      const now = new Date();
      // Get the Monday of current week
      const day = now.getDay();
      const diff = now.getDate() - (day === 0 ? 6 : day - 1);
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff);
      
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const ds = d.toLocaleDateString('sv-SE');
        const dayMeals = meals.filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === ds);
        const dayTotalProtein = dayMeals.reduce((acc, curr) => acc + curr.proteinGrams, 0);
        data.push({ date: ds, totalProtein: dayTotalProtein, goal: goal });
      }
      return data;
    } else {
      const data: DailySummary[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        
        const monthMeals = meals.filter(m => {
          const mDate = new Date(m.timestamp);
          return mDate.getFullYear() === year && mDate.getMonth() === month;
        });
        
        const monthTotalProtein = monthMeals.reduce((acc, curr) => acc + curr.proteinGrams, 0);
        
        const ds = `${year}-${String(month + 1).padStart(2, '0')}`;
        data.push({ 
          date: ds, 
          totalProtein: monthTotalProtein, 
          goal: goal * 30 
        });
      }
      return data;
    }
  }, [meals, historyPeriod, goal]);

  const maxProtein = useMemo(() => {
    const values = historyData.map(d => d.totalProtein);
    const target = historyPeriod === 'week' ? goal : goal * 30;
    return Math.max(...values, target, 1);
  }, [historyData, historyPeriod, goal]);

  const selectedDayMeals = useMemo(() => {
    if (!selectedHistoryDate) return [];
    return meals
      .filter(m => {
        const mDate = new Date(m.timestamp).toLocaleDateString('sv-SE');
        if (historyPeriod === 'week') {
          return mDate === selectedHistoryDate;
        } else {
          return mDate.startsWith(selectedHistoryDate);
        }
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [meals, selectedHistoryDate, historyPeriod]);

  const renderMealCard = (meal: MealLog) => (
    <div key={meal.id} className="group bg-white rounded-3xl p-4 shadow-sm flex items-center border border-slate-100 transition-all hover:shadow-md hover:border-indigo-100">
      <div className="relative w-16 h-16 rounded-2xl bg-slate-50 overflow-hidden flex-shrink-0 border border-slate-100">
        {meal.imageUrl ? (
          <img src={meal.imageUrl} alt={meal.foodName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl">
            🍴
          </div>
        )}
      </div>
      <div className="ml-4 flex-grow">
        <div className="flex items-center space-x-2 text-[10px] font-bold text-slate-400 mb-0.5">
          <ClockIcon className="w-3 h-3" />
          <span>{formatTime(meal.timestamp)}</span>
        </div>
        <h3 className="font-bold text-slate-800 text-sm truncate max-w-[160px]">{meal.foodName}</h3>
        <div className="flex items-center space-x-3 mt-0.5">
          <p className="text-indigo-600 font-black text-xs">{meal.proteinGrams}g</p>
        </div>
      </div>
      <button 
        onClick={() => deleteMeal(meal.id)} 
        className="p-2.5 text-slate-200 hover:text-red-400 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
      >
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#FDFDFF] flex flex-col pb-10 relative overflow-x-hidden font-sans">
      {/* Dynamic Header */}
      <header className="bg-white px-6 pt-14 pb-8 rounded-b-[40px] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] sticky top-0 z-30 transition-all">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Protein <span className="text-indigo-600">AI</span></h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Daily Tracker</p>
          </div>
          <button 
            onClick={() => {
              setCurrentView(currentView === 'daily' ? 'history' : 'daily');
              setSelectedHistoryDate(null);
            }}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-inner hover:scale-105 active:scale-95 transition-all"
          >
            {currentView === 'daily' ? <ChartBarIcon className="w-6 h-6" /> : <HomeIcon className="w-6 h-6" />}
          </button>
        </div>

        {currentView === 'daily' && (
          <div className="space-y-6">
            <div className="flex justify-between items-end relative">
              <div className="z-10">
                <div className="flex items-baseline space-x-1">
                  <span className="text-5xl font-black text-slate-900 tabular-nums">{todayStats.protein}</span>
                  <span className="text-slate-400 font-bold text-xl">/ {goal}g</span>
                </div>
              </div>

              <div className="text-right z-10">
                <div className={`inline-flex items-center space-x-2 rounded-2xl px-3 py-2 transition-all ${isEditingGoal ? 'bg-indigo-600 shadow-lg scale-110' : 'bg-slate-50'}`}>
                  {isEditingGoal ? (
                    <input 
                      ref={goalInputRef}
                      type="number" 
                      value={goal} 
                      onChange={(e) => setGoal(Number(e.target.value) || 0)}
                      onBlur={() => setIsEditingGoal(false)}
                      className="w-14 text-center text-sm font-black text-white bg-transparent outline-none border-none p-0"
                    />
                  ) : (
                    <span className="text-xs font-black text-slate-700">{goal}g</span>
                  )}
                  <button 
                    onClick={toggleEditGoal}
                    className={`p-1 rounded-lg transition-colors ${isEditingGoal ? 'text-indigo-200' : 'text-slate-400 hover:text-indigo-600'}`}
                  >
                    {isEditingGoal ? <CheckIcon className="w-4 h-4" /> : <PencilSquareIcon className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[9px] font-bold text-slate-300 uppercase mt-2 tracking-widest">Target Protein</p>
              </div>
              
              <div className="absolute -top-10 -left-10 w-32 h-32 bg-indigo-100 rounded-full blur-3xl opacity-40 -z-10" />
            </div>

            <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all duration-1000 ease-out rounded-full" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
            
            <div className="flex items-center justify-center space-x-2 py-1 px-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
              <SparklesIcon className="w-4 h-4 text-indigo-500 animate-pulse" />
              <p className="text-center font-bold text-[11px] text-indigo-700/80">{getEncouragement()}</p>
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow px-6 py-10">
        {currentView === 'daily' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-800 flex items-center">
                <CalendarDaysIcon className="w-4 h-4 mr-2 text-indigo-500" /> 오늘의 기록
              </h2>
              <span className="text-[10px] font-bold text-slate-400">{todayMeals.length}개 식사</span>
            </div>

            {/* In-flow Action Bar for Daily View */}
            <div className="space-y-4">
              {isAnalyzing && (
                <div className="bg-slate-900/95 backdrop-blur-xl text-white px-6 py-3 rounded-2xl flex items-center space-x-3 shadow-lg animate-in zoom-in-95 duration-200">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px] font-black uppercase tracking-widest">{analysisStep}</span>
                </div>
              )}
              
              <div className="bg-white p-4 rounded-[32px] shadow-sm flex items-center justify-around w-full border border-slate-100">
                <button 
                  onClick={() => albumInputRef.current?.click()} 
                  disabled={isAnalyzing} 
                  className="w-14 h-14 flex items-center justify-center text-slate-400 hover:text-indigo-600 active:scale-90 transition-all rounded-2xl bg-slate-50"
                >
                  <PhotoIcon className="w-7 h-7" />
                </button>
                
                <button 
                  onClick={() => cameraInputRef.current?.click()} 
                  disabled={isAnalyzing} 
                  className="w-16 h-16 bg-indigo-600 text-white flex items-center justify-center rounded-2xl shadow-md shadow-indigo-100 active:scale-95 transition-all"
                >
                  <CameraIcon className="w-8 h-8" />
                </button>
                
                <button 
                  onClick={() => setIsTextModalOpen(true)} 
                  disabled={isAnalyzing} 
                  className="w-14 h-14 flex items-center justify-center text-slate-400 hover:text-indigo-600 active:scale-90 transition-all rounded-2xl bg-slate-50"
                >
                  <PencilIcon className="w-7 h-7" />
                </button>
              </div>
            </div>
            
            {todayMeals.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center bg-white rounded-[40px] border-2 border-dashed border-slate-100 group transition-all hover:border-indigo-100">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <PlusIcon className="w-10 h-10 text-slate-200" />
                </div>
                <p className="text-sm font-bold text-slate-400">아직 기록된 식사가 없습니다</p>
              </div>
            ) : (
              <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {todayMeals.map(renderMealCard)}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-300">
            {!selectedHistoryDate ? (
              <>
                <div className="flex bg-slate-100/80 p-1.5 rounded-2xl">
                  <button onClick={() => setHistoryPeriod('week')} className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${historyPeriod === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Weekly</button>
                  <button onClick={() => setHistoryPeriod('month')} className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${historyPeriod === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Monthly</button>
                </div>
                
                <div className="bg-white p-6 rounded-[40px] shadow-sm border border-slate-100 h-64 flex items-end justify-between space-x-2 px-6">
                  {historyData.map((d, i) => {
                    const currentTarget = historyPeriod === 'week' ? goal : goal * 30;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center h-full group">
                        <div className="flex-grow w-full flex items-end relative">
                           <div className="absolute w-full border-t border-slate-100 border-dashed" style={{ bottom: `${(currentTarget / maxProtein) * 100}%` }} />
                          
                          <button 
                            onClick={() => setSelectedHistoryDate(d.date)}
                            className={`w-full rounded-t-xl transition-all relative overflow-hidden group-hover:brightness-110 ${d.totalProtein >= currentTarget ? 'bg-indigo-600' : 'bg-indigo-100'}`}
                            style={{ height: `${(d.totalProtein / maxProtein) * 100}%`, minHeight: '6px' }}
                          >
                            {d.totalProtein >= currentTarget && (
                              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                            )}
                          </button>
                        </div>
                        <span className="text-[8px] font-bold text-slate-400 mt-3 whitespace-nowrap">
                          {historyPeriod === 'week' 
                            ? d.date.split('-').slice(1).join('/') 
                            : `${d.date.split('-')[1]}월`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-indigo-600 rounded-[32px] p-6 text-white flex items-center justify-between shadow-xl shadow-indigo-200">
                  <div>
                    <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">
                      {historyPeriod === 'week' ? 'Weekly Average' : 'Monthly Average'}
                    </p>
                    <h3 className="text-2xl font-black">
                      {Math.round(historyData.reduce((a, b) => a + b.totalProtein, 0) / historyData.length)}g
                    </h3>
                  </div>
                  <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                    <ChartBarIcon className="w-6 h-6" />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <button 
                    onClick={() => setSelectedHistoryDate(null)} 
                    className="flex items-center text-xs font-black text-slate-500 bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-slate-100 active:scale-95 transition-all"
                  >
                    <ChevronLeftIcon className="w-4 h-4 mr-1" /> 목록으로
                  </button>
                  <h2 className="text-sm font-black text-slate-800">
                    {historyPeriod === 'week' ? selectedHistoryDate : `${selectedHistoryDate.split('-')[0]}년 ${selectedHistoryDate.split('-')[1]}월`}
                  </h2>
                </div>
                
                <div className="grid gap-4">
                  {selectedDayMeals.length > 0 ? (
                    selectedDayMeals.map(renderMealCard)
                  ) : (
                    <div className="text-center py-20 text-slate-300 font-bold">기록이 없습니다.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Text Input Modal */}
      {isTextModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="font-black text-slate-900 text-lg">직접 입력하기</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Manual Food Entry</p>
              </div>
              <button onClick={() => setIsTextModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-2xl text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleManualSubmit} className="space-y-6">
              <div className="relative">
                <input 
                  autoFocus
                  type="text" 
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="예: 닭가슴살 200g, 삶은 계란 2개..."
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-5 text-sm font-bold outline-none ring-2 ring-transparent focus:ring-indigo-500 transition-all placeholder:text-slate-300"
                />
              </div>
              <button 
                type="submit" 
                className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 hover:brightness-110 active:scale-95 transition-all"
              >
                단백질 계산하기
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Hidden Inputs */}
      <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
      <input type="file" ref={albumInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
    </div>
  );
}
