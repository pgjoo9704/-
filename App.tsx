
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { MealLog, DailySummary, MealCategory } from './types';
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
  SparklesIcon
} from '@heroicons/react/24/outline';

const MODEL_NAME = 'gemini-3-flash-preview';
const MAX_IMAGE_DIMENSION = 1024; 

// 이미지 리사이징 헬퍼
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
      const ai = new GoogleGenAI({ apiKey: (process.env as any).API_KEY });
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

      const resultText = response.text;
      if (!resultText) {
        throw new Error("AI 응답을 받지 못했습니다.");
      }
      const result = JSON.parse(resultText);
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

  // FIX: The useMemo hook was incomplete.
  const historyData = useMemo(() => {
    const data: DailySummary[] = [];
    const now = new Date();
    
    if (historyPeriod === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - (day === 0 ? 6 : day - 1); // Monday is start of week
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
    } else { // 'month'
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
        const monthMeals = meals.filter(m => new Date(m.timestamp).toISOString().slice(0, 7) === monthStr);
        const monthTotalProtein = monthMeals.reduce((acc, curr) => acc + curr.proteinGrams, 0);
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        
        data.push({ date: monthStr, totalProtein: monthTotalProtein, goal: goal * daysInMonth });
      }
      return data;
    }
  }, [meals, goal, historyPeriod]);

  // FIX: The component was missing a return statement, causing the "not a valid JSX element" error.
  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col items-center">
      <div className="w-full max-w-md mx-auto bg-gray-800 rounded-lg shadow-lg flex flex-col h-screen">
        <header className="p-4 bg-gray-900 rounded-t-lg flex justify-between items-center">
          <h1 className="text-xl font-bold text-teal-400">프로틴 트래커</h1>
        </header>

        <main className="flex-grow p-4 overflow-y-auto">
          {currentView === 'daily' && (
            <>
              <div className="bg-gray-700 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">오늘의 목표</span>
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
                        className="w-20 bg-gray-800 text-white p-1 rounded"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-teal-400">{goal}g</span>
                    )}
                  </div>
                  <button onClick={toggleEditGoal} className="p-1 rounded-full hover:bg-gray-600">
                    {isEditingGoal ? <CheckIcon className="w-5 h-5" /> : <PencilIcon className="w-5 h-5" />}
                  </button>
                </div>
                <div className="w-full bg-gray-600 rounded-full h-4">
                  <div
                    className="bg-teal-500 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span>{todayStats.protein.toFixed(0)}g 섭취</span>
                  <span>{Math.max(goal - todayStats.protein, 0).toFixed(0)}g 남음</span>
                </div>
                <p className="text-center mt-3 text-sm text-gray-400">{getEncouragement()}</p>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold">오늘의 식단</h2>
                {todayMeals.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">아직 기록된 식단이 없습니다.</p>
                ) : (
                  todayMeals.map(meal => (
                    <div key={meal.id} className="bg-gray-700 rounded-lg p-3 flex items-center space-x-3">
                      {meal.imageUrl && <img src={meal.imageUrl} alt={meal.foodName} className="w-16 h-16 rounded-md object-cover" />}
                      <div className="flex-grow">
                        <div className="flex justify-between items-start">
                          <p className="font-semibold">{meal.foodName}</p>
                          <span className="text-lg font-bold text-teal-400">{meal.proteinGrams}g</span>
                        </div>
                        <div className="flex justify-between items-end text-sm text-gray-400 mt-1">
                           <span>{meal.category}</span>
                           <div className="flex items-center space-x-3">
                              <span>{formatTime(meal.timestamp)}</span>
                              <button onClick={() => deleteMeal(meal.id)} className="p-1 hover:text-red-500">
                                <TrashIcon className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {currentView === 'history' && (
            <div className="h-full flex flex-col">
              <h2 className="text-lg font-semibold mb-2">섭취 기록</h2>
              <div className="flex justify-center bg-gray-700 p-1 rounded-lg mb-4">
                <button onClick={() => setHistoryPeriod('week')} className={`px-4 py-1 rounded-md text-sm font-medium w-1/2 ${historyPeriod === 'week' ? 'bg-teal-500 text-white' : 'text-gray-300'}`}>주간</button>
                <button onClick={() => setHistoryPeriod('month')} className={`px-4 py-1 rounded-md text-sm font-medium w-1/2 ${historyPeriod === 'month' ? 'bg-teal-500 text-white' : 'text-gray-300'}`}>월간</button>
              </div>
              <div className="mb-4 h-48 bg-gray-700 rounded-lg p-2 flex items-end justify-around">
                {historyData.map((d, i) => (
                  <div key={i} className="flex flex-col items-center w-full" onClick={() => historyPeriod === 'week' && setSelectedHistoryDate(d.date)}>
                    <div className="h-full w-full flex items-end justify-center">
                      <div 
                        className="w-4/5 bg-teal-500 rounded-t-sm hover:bg-teal-400 cursor-pointer"
                        style={{ height: `${Math.min(100, (d.totalProtein / (historyPeriod === 'week' ? goal : (goal * 30))) * 100)}%`}}
                      ></div>
                    </div>
                    <span className="text-xs mt-1 text-gray-400">
                      {historyPeriod === 'week' ? new Date(d.date).getDate() + '일' : new Date(d.date + '-02').toLocaleString('default', { month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>

              {selectedHistoryDate && (
                 <div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold">{new Date(selectedHistoryDate).toLocaleDateString('ko-KR')} 식단</h3>
                      <button onClick={() => setSelectedHistoryDate(null)}><XMarkIcon className="w-5 h-5" /></button>
                    </div>
                    <div className="space-y-2">
                    {meals.filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === selectedHistoryDate).length > 0 ? (
                      meals.filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === selectedHistoryDate)
                      .sort((a, b) => b.timestamp - a.timestamp)
                      .map(meal => (
                        <div key={meal.id} className="bg-gray-700 rounded-lg p-2 flex items-center space-x-2">
                          {meal.imageUrl && <img src={meal.imageUrl} alt={meal.foodName} className="w-12 h-12 rounded-md object-cover" />}
                          <div className="flex-grow">
                            <p className="font-semibold text-sm">{meal.foodName}</p>
                            <p className="text-xs text-gray-400">{formatTime(meal.timestamp)}</p>
                          </div>
                          <span className="font-bold text-teal-400">{meal.proteinGrams}g</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center py-2">이 날은 기록이 없습니다.</p>
                    )}
                    </div>
                 </div>
              )}
            </div>
          )}
        </main>
        
        {currentView === 'daily' && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center py-3 rounded-lg bg-teal-600 hover:bg-teal-700 transition-colors"
              >
                <CameraIcon className="w-7 h-7" />
                <span className="text-sm mt-1">카메라</span>
              </button>
              <button
                onClick={() => albumInputRef.current?.click()}
                className="flex flex-col items-center justify-center py-3 rounded-lg bg-teal-600 hover:bg-teal-700 transition-colors"
              >
                <PhotoIcon className="w-7 h-7" />
                <span className="text-sm mt-1">앨범</span>
              </button>
              <button
                onClick={() => setIsTextModalOpen(true)}
                className="flex flex-col items-center justify-center py-3 rounded-lg bg-teal-600 hover:bg-teal-700 transition-colors"
              >
                <PencilSquareIcon className="w-7 h-7" />
                <span className="text-sm mt-1">텍스트</span>
              </button>
            </div>
          </div>
        )}

        <footer className="p-2 bg-gray-900 rounded-b-lg mt-auto flex justify-around border-t border-gray-700">
          <button onClick={() => setCurrentView('daily')} className={`flex flex-col items-center p-2 w-1/2 rounded-lg ${currentView === 'daily' ? 'text-teal-400' : 'text-gray-400'}`}>
            <HomeIcon className="w-6 h-6" />
            <span className="text-xs mt-1">오늘</span>
          </button>
          <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center p-2 w-1/2 rounded-lg ${currentView === 'history' ? 'text-teal-400' : 'text-gray-400'}`}>
            <ChartBarIcon className="w-6 h-6" />
            <span className="text-xs mt-1">기록</span>
          </button>
        </footer>

        {isAnalyzing && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col justify-center items-center z-50">
            <SparklesIcon className="w-16 h-16 text-teal-400 animate-pulse" />
            <p className="mt-4 text-lg">{analysisStep}</p>
          </div>
        )}

        {isTextModalOpen && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-4 w-full max-w-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">텍스트로 식단 기록</h3>
                <button onClick={() => setIsTextModalOpen(false)} className="p-1 rounded-full hover:bg-gray-700">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleManualSubmit}>
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="예: 닭가슴살 샐러드, 프로틴 쉐이크"
                  className="w-full h-24 bg-gray-700 text-white p-2 rounded-md mb-4 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center disabled:opacity-50"
                  disabled={!manualText.trim()}
                >
                  <SparklesIcon className="w-5 h-5 mr-2" />
                  AI로 분석하기
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <input type="file" accept="image/*" capture="camera" ref={cameraInputRef} onChange={handleImageUpload} className="hidden" />
      <input type="file" accept="image/*" ref={albumInputRef} onChange={handleImageUpload} className="hidden" />
    </div>
  );
}
