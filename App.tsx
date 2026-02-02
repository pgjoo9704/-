
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MealLog, DailySummary, MealCategory } from './types';
// Import GoogleGenAI and Type to enable AI-powered food recognition
import { GoogleGenAI, Type } from "@google/genai";
import { 
  CameraIcon, 
  PhotoIcon, 
  ChartBarIcon,
  TrashIcon,
  HomeIcon,
  PencilIcon,
  XMarkIcon,
  PencilSquareIcon,
  CheckIcon,
  PlusIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';

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
    return saved ? parseInt(saved, 10) : 60;
  });

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [currentView, setCurrentView] = useState<'daily' | 'history'>('daily');
  const [historyPeriod, setHistoryPeriod] = useState<'week' | 'month'>('week');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [pendingFoodName, setPendingFoodName] = useState('');
  const [pendingProtein, setPendingProtein] = useState<string>('');
  const [pendingCategory, setPendingCategory] = useState<MealCategory>('Other');
  const [pendingImage, setPendingImage] = useState<string | undefined>(undefined);
  const [pendingDate, setPendingDate] = useState<string>(new Date().toLocaleDateString('sv-SE'));

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

  const getEncouragement = () => {
    if (todayStats.protein === 0) return "오늘의 첫 단백질을 기록해보세요! 💪";
    if (progressPercent < 30) return "좋은 시작이에요! 조금 더 힘내세요. 🚀";
    if (progressPercent < 70) return "절반 이상 왔습니다! 계속 가볼까요? 🔥";
    if (progressPercent < 100) return "목표가 코앞이에요! 거의 다 왔습니다. ✨";
    return "오늘의 목표 달성! 정말 대단해요! 🏆";
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const openAddModal = (img?: string, name: string = '', date?: string, protein: string = '', category: MealCategory = 'Other', mealId: string | null = null) => {
    setEditingMealId(mealId);
    setPendingImage(img);
    setPendingFoodName(name);
    setPendingProtein(protein);
    setPendingCategory(category);
    setPendingDate(date || new Date().toLocaleDateString('sv-SE'));
    setIsInputModalOpen(true);
  };

  const handleEditMeal = (meal: MealLog) => {
    openAddModal(
      meal.imageUrl,
      meal.foodName,
      new Date(meal.timestamp).toLocaleDateString('sv-SE'),
      meal.proteinGrams.toString(),
      meal.category,
      meal.id
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const resized = await resizeImage(reader.result as string);
      
      setIsAnalyzing(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const base64Data = resized.split(',')[1];
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
              { text: "Estimate the food name, protein in grams, and meal category (Breakfast, Lunch, Dinner, Snack, or Other) from this image. Please respond in Korean if possible." }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                foodName: { type: Type.STRING },
                proteinGrams: { type: Type.NUMBER },
                category: { type: Type.STRING }
              },
              required: ["foodName", "proteinGrams", "category"]
            }
          }
        });
        
        const result = JSON.parse(response.text || '{}');
        openAddModal(
          resized, 
          result.foodName || '', 
          undefined, 
          result.proteinGrams?.toString() || '', 
          (result.category as MealCategory) || 'Other'
        );
      } catch (error) {
        console.error("AI analysis failed:", error);
        openAddModal(resized);
      } finally {
        setIsAnalyzing(false);
      }
      
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const protein = parseFloat(pendingProtein);
    if (!pendingFoodName.trim() || isNaN(protein)) return;

    if (editingMealId) {
      setMeals(prev => prev.map(meal => {
        if (meal.id === editingMealId) {
          return {
            ...meal,
            foodName: pendingFoodName,
            proteinGrams: Math.round(protein),
            category: pendingCategory,
            imageUrl: pendingImage
          };
        }
        return meal;
      }));
    } else {
      const now = new Date();
      const selectedDate = new Date(pendingDate);
      selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      const newMeal: MealLog = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: selectedDate.getTime(),
        foodName: pendingFoodName,
        proteinGrams: Math.round(protein),
        category: pendingCategory,
        imageUrl: pendingImage
      };
      setMeals(prev => [newMeal, ...prev]);
    }
    
    setIsInputModalOpen(false);
    setEditingMealId(null);
    setPendingImage(undefined);
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
    const data: DailySummary[] = [];
    const now = new Date();
    if (historyPeriod === 'week') {
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
      for (let i = -2; i <= 2; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStr = d.toISOString().slice(0, 7);
        const monthMeals = meals.filter(m => new Date(m.timestamp).toISOString().slice(0, 7) === monthStr);
        const monthTotalProtein = monthMeals.reduce((acc, curr) => acc + curr.proteinGrams, 0);
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        data.push({ date: monthStr, totalProtein: monthTotalProtein, goal: goal * daysInMonth });
      }
      return data;
    }
  }, [meals, goal, historyPeriod]);

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen font-sans flex flex-col items-center">
      <div className="w-full max-w-md mx-auto bg-white shadow-xl flex flex-col h-screen relative border-x border-slate-100">
        <header className="p-4 bg-white flex justify-between items-center border-b border-slate-100">
          <h1 className="text-xl font-extrabold text-blue-600 tracking-tight">Protein tracker</h1>
          <div className="flex space-x-2">
             <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          </div>
        </header>

        <main className="flex-grow p-4 overflow-y-auto space-y-6">
          {currentView === 'daily' && (
            <>
              {/* Daily Goal Card */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">오늘의 단백질 목표</span>
                    <div className="flex items-center space-x-2 mt-1">
                      {isEditingGoal ? (
                        <input
                          ref={goalInputRef}
                          type="number"
                          defaultValue={goal}
                          onBlur={(e) => {
                            const newGoal = parseInt(e.target.value, 10);
                            if (!isNaN(newGoal) && newGoal > 0) {
                              setGoal(newGoal);
                            }
                            setIsEditingGoal(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-20 bg-slate-50 text-blue-600 font-bold text-2xl p-1 rounded border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      ) : (
                        <span className="text-3xl font-black text-blue-600">{goal}g</span>
                      )}
                      <button onClick={toggleEditGoal} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                        {isEditingGoal ? <CheckIcon className="w-5 h-5 text-green-500" /> : <PencilIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="w-16 h-16 rounded-full border-4 border-slate-50 flex items-center justify-center relative overflow-hidden">
                     <div className="absolute inset-0 bg-blue-50"></div>
                     <span className="relative z-10 text-xs font-black text-blue-600">{progressPercent.toFixed(0)}%</span>
                  </div>
                </div>
                
                <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
                
                <div className="flex justify-between text-xs mt-3 font-bold">
                  <span className="text-slate-600">현재 {todayStats.protein.toFixed(0)}g</span>
                  <span className="text-blue-500">잔여 {Math.max(goal - todayStats.protein, 0).toFixed(0)}g</span>
                </div>
                
                <div className="mt-6 bg-blue-50 rounded-2xl p-4 border border-blue-100/50">
                  <p className="text-sm text-blue-700 font-semibold text-center leading-relaxed italic">
                    "{getEncouragement()}"
                  </p>
                </div>
              </div>

              {/* Meal List Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <h2 className="text-lg font-extrabold text-slate-800">식단 기록</h2>
                  <span className="text-xs font-bold text-slate-400 uppercase">{todayMeals.length} ITEMS</span>
                </div>
                
                {todayMeals.length === 0 ? (
                  <div className="text-slate-400 text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-100 flex flex-col items-center">
                    <div className="bg-slate-50 p-4 rounded-full mb-4">
                      <PencilSquareIcon className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="font-bold">오늘 드신 음식을 기록해보세요</p>
                    <p className="text-xs mt-1 text-slate-300">카메라나 직접 입력으로 간편하게!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayMeals.map(meal => (
                      <div key={meal.id} className="bg-white rounded-2xl p-4 flex items-center space-x-4 border border-slate-100 shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
                        {meal.imageUrl ? (
                          <img src={meal.imageUrl} alt={meal.foodName} className="w-16 h-16 rounded-xl object-cover shadow-sm ring-1 ring-slate-100" />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-100">
                             <PencilIcon className="w-6 h-6" />
                          </div>
                        )}
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start">
                            <p className="font-bold text-slate-800 truncate leading-tight">{meal.foodName}</p>
                            <span className="text-lg font-black text-blue-600 whitespace-nowrap ml-2">{meal.proteinGrams}g</span>
                          </div>
                          <div className="flex justify-between items-center mt-2">
                             <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                {meal.category}
                             </span>
                             <div className="flex items-center space-x-2">
                                <span className="text-[10px] font-bold text-slate-400">{formatTime(meal.timestamp)}</span>
                                <div className="flex items-center space-x-1 border-l border-slate-100 pl-2">
                                  <button onClick={() => handleEditMeal(meal)} className="p-1 text-slate-300 hover:text-blue-500 transition-colors">
                                    <PencilSquareIcon className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => deleteMeal(meal.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </div>
                             </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'history' && (
            <div className="h-full flex flex-col fade-in space-y-6">
              <h2 className="text-xl font-extrabold text-slate-800">섭취 기록 리포트</h2>
              
              <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner">
                <button onClick={() => {setHistoryPeriod('week'); setSelectedHistoryDate(null);}} className={`px-4 py-2.5 rounded-xl text-sm font-black w-1/2 transition-all ${historyPeriod === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>주간</button>
                <button onClick={() => {setHistoryPeriod('month'); setSelectedHistoryDate(null);}} className={`px-4 py-2.5 rounded-xl text-sm font-black w-1/2 transition-all ${historyPeriod === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>월간</button>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="h-64 flex items-end justify-around relative mt-4">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none opacity-20">
                    <div className="border-t border-slate-200 w-full h-0"></div>
                    <div className="border-t border-slate-200 w-full h-0"></div>
                    <div className="border-t border-slate-200 w-full h-0"></div>
                  </div>

                  {historyData.map((d, i) => {
                    const daysInMonth = historyPeriod === 'month' ? new Date(parseInt(d.date.split('-')[0]), parseInt(d.date.split('-')[1]), 0).getDate() : 1;
                    const displayValue = historyPeriod === 'week' ? d.totalProtein : Math.round(d.totalProtein / daysInMonth);
                    const barHeight = Math.min(100, (d.totalProtein / d.goal) * 100);
                    const isToday = historyPeriod === 'week' ? d.date === todayStr : new Date().toISOString().slice(0, 7) === d.date;

                    return (
                      <div key={i} className="flex flex-col items-center w-full h-full justify-end relative z-10" onClick={() => historyPeriod === 'week' && setSelectedHistoryDate(d.date)}>
                        <div className="h-full w-full flex items-end justify-center group cursor-pointer relative">
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-100">
                             <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${selectedHistoryDate === d.date || isToday ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                               {displayValue}g
                             </span>
                          </div>
                          
                          <div 
                            className={`w-3/5 rounded-t-xl transition-all duration-500 ${selectedHistoryDate === d.date ? 'bg-blue-600 ring-4 ring-blue-50' : isToday ? 'bg-blue-600' : 'bg-blue-200 group-hover:bg-blue-300'}`}
                            style={{ height: `${Math.max(barHeight, 5)}%`}}
                          ></div>
                        </div>
                        <span className={`text-[10px] mt-3 font-bold ${selectedHistoryDate === d.date || isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                          {historyPeriod === 'week' ? new Date(d.date).getDate() + '일' : new Date(d.date + '-02').toLocaleString('ko-KR', { month: 'short' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedHistoryDate && historyPeriod === 'week' && (
                 <div className="slide-in-from-bottom-4 space-y-4 pb-10">
                    <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                      <div className="flex flex-col">
                        <h3 className="font-black text-slate-800 leading-tight text-lg">{new Date(selectedHistoryDate).toLocaleDateString('ko-KR')} 상세</h3>
                        <span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Detail Log</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => openAddModal(undefined, '', selectedHistoryDate)}
                          className="p-2 bg-blue-600 text-white rounded-2xl flex items-center text-xs font-black shadow-md shadow-blue-200 active:scale-95 transition-all"
                        >
                          <PlusIcon className="w-4 h-4 mr-1" /> 추가
                        </button>
                        <button onClick={() => setSelectedHistoryDate(null)} className="p-2 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors text-slate-400">
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                    {meals.filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === selectedHistoryDate).length > 0 ? (
                      meals.filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === selectedHistoryDate)
                      .sort((a, b) => b.timestamp - a.timestamp)
                      .map(meal => (
                        <div key={meal.id} className="bg-white rounded-2xl p-4 flex items-center space-x-4 border border-slate-100 shadow-sm">
                          {meal.imageUrl ? (
                            <img src={meal.imageUrl} alt={meal.foodName} className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-100" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-200 border border-slate-100">
                               <PencilIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div className="flex-grow min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{meal.foodName}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{meal.category} • {formatTime(meal.timestamp)}</p>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="font-black text-blue-600 whitespace-nowrap">{meal.proteinGrams}g</span>
                            <div className="flex items-center space-x-1 border-l border-slate-50 pl-2">
                                <button onClick={() => handleEditMeal(meal)} className="p-1 text-slate-300 hover:text-blue-500 transition-colors">
                                  <PencilSquareIcon className="w-4 h-4" />
                                </button>
                                <button onClick={() => deleteMeal(meal.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-300 text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-100">
                         <p className="text-sm font-bold">이 날의 기록이 없습니다.</p>
                      </div>
                    )}
                    </div>
                 </div>
              )}
            </div>
          )}
        </main>
        
        {/* FAB Style Menu for Daily View */}
        {currentView === 'daily' && (
          <div className="px-6 pb-8 pt-4 bg-white border-t border-slate-50">
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 rounded-3xl bg-blue-600 text-white shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 group"
              >
                <div className="bg-white/20 p-2.5 rounded-2xl group-hover:bg-white/30 mb-2 transition-colors">
                  <CameraIcon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">카메라</span>
              </button>
              <button
                onClick={() => albumInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 rounded-3xl bg-white text-blue-600 shadow-lg shadow-slate-100 border border-slate-100 hover:bg-slate-50 transition-all active:scale-95 group"
              >
                <div className="bg-blue-50 p-2.5 rounded-2xl group-hover:bg-blue-100 mb-2 transition-colors">
                  <PhotoIcon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">앨범</span>
              </button>
              <button
                onClick={() => openAddModal()}
                className="flex flex-col items-center justify-center p-4 rounded-3xl bg-white text-slate-600 shadow-lg shadow-slate-100 border border-slate-100 hover:bg-slate-50 transition-all active:scale-95 group"
              >
                <div className="bg-slate-50 p-2.5 rounded-2xl group-hover:bg-slate-100 mb-2 transition-colors">
                  <PencilSquareIcon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">직접 입력</span>
              </button>
            </div>
          </div>
        )}

        <footer className="h-20 bg-white flex items-center justify-around border-t border-slate-50 px-8">
          <button onClick={() => setCurrentView('daily')} className={`flex flex-col items-center justify-center w-1/3 transition-all ${currentView === 'daily' ? 'text-blue-600' : 'text-slate-300'}`}>
            <HomeIcon className={`w-7 h-7 ${currentView === 'daily' ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
            <span className="text-[9px] mt-1 font-black uppercase tracking-widest">홈</span>
            {currentView === 'daily' && <div className="w-1 h-1 bg-blue-600 rounded-full mt-1"></div>}
          </button>
          <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center justify-center w-1/3 transition-all ${currentView === 'history' ? 'text-blue-600' : 'text-slate-300'}`}>
            <ChartBarIcon className={`w-7 h-7 ${currentView === 'history' ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
            <span className="text-[9px] mt-1 font-black uppercase tracking-widest">기록</span>
            {currentView === 'history' && <div className="w-1 h-1 bg-blue-600 rounded-full mt-1"></div>}
          </button>
        </footer>

        {/* AI Loading Overlay */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60] fade-in">
            <div className="bg-white p-8 rounded-[40px] flex flex-col items-center space-y-4 shadow-2xl border border-slate-100">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                </div>
              </div>
              <div className="text-center">
                <p className="font-black text-slate-800 text-lg">AI 분석 중</p>
                <p className="text-xs text-slate-400 font-bold mt-1">식단을 인식하고 있습니다...</p>
              </div>
            </div>
          </div>
        )}

        {/* Input Modal */}
        {isInputModalOpen && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-end sm:items-center z-50 p-4 fade-in">
            <div className="bg-white rounded-t-[40px] sm:rounded-[40px] p-8 w-full max-sm:w-full max-w-sm shadow-2xl slide-in-from-bottom-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 leading-tight">{editingMealId ? '정보 수정' : '식단 입력'}</h3>
                  <div className="flex items-center space-x-1 mt-1">
                    <CalendarDaysIcon className="w-3 h-3 text-blue-500" />
                    <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest">{pendingDate === todayStr ? 'TODAY' : pendingDate}</p>
                  </div>
                </div>
                <button onClick={() => {setIsInputModalOpen(false); setEditingMealId(null);}} className="p-2.5 rounded-2xl hover:bg-slate-50 bg-slate-100 text-slate-400 transition-colors">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleSaveMeal} className="space-y-6">
                {pendingImage && (
                  <div className="relative group">
                    <img src={pendingImage} alt="Preview" className="w-full h-44 object-cover rounded-3xl shadow-md ring-1 ring-slate-100" />
                    <div className="absolute top-3 right-3 bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase shadow-lg">AI Preview</div>
                  </div>
                )}
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">음식 이름</label>
                    <input
                      type="text"
                      value={pendingFoodName}
                      onChange={(e) => setPendingFoodName(e.target.value)}
                      placeholder="예: 닭가슴살 샐러드"
                      className="w-full bg-slate-50 text-slate-900 px-5 py-4 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:outline-none border-none transition-all placeholder:text-slate-300 font-bold"
                      autoFocus={!pendingImage}
                      required
                    />
                  </div>
                  
                  <div className="flex space-x-4">
                    <div className="w-3/5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">단백질 (g)</label>
                      <input
                        type="number"
                        value={pendingProtein}
                        onChange={(e) => setPendingProtein(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-50 text-slate-900 px-5 py-4 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:outline-none border-none transition-all placeholder:text-slate-300 font-black text-lg"
                        required
                      />
                    </div>
                    <div className="w-2/5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">분류</label>
                      <select
                        value={pendingCategory}
                        onChange={(e) => setPendingCategory(e.target.value as MealCategory)}
                        className="w-full bg-slate-50 text-slate-900 px-4 py-4 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:outline-none border-none transition-all appearance-none font-bold"
                      >
                        <option value="Breakfast">아침</option>
                        <option value="Lunch">점심</option>
                        <option value="Dinner">저녁</option>
                        <option value="Snack">간식</option>
                        <option value="Other">기타</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4.5 px-4 rounded-[22px] flex items-center justify-center mt-10 shadow-xl shadow-blue-100 active:scale-95 transition-all"
                >
                  {editingMealId ? (
                    <>
                      <CheckIcon className="w-5 h-5 mr-2 stroke-[3px]" />
                      수정 완료
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-5 h-5 mr-2 stroke-[3px]" />
                      기록 저장
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleImageUpload} className="hidden" />
      <input type="file" accept="image/*" ref={albumInputRef} onChange={handleImageUpload} className="hidden" />
    </div>
  );
}
