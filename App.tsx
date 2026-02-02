
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  PlusIcon
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
    return saved ? parseInt(saved, 10) : 120;
  });

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [currentView, setCurrentView] = useState<'daily' | 'history'>('daily');
  const [historyPeriod, setHistoryPeriod] = useState<'week' | 'month'>('week');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  
  // 새 식단 입력 모달 상태
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [pendingFoodName, setPendingFoodName] = useState('');
  const [pendingProtein, setPendingProtein] = useState<string>('');
  const [pendingCategory, setPendingCategory] = useState<MealCategory>('Other');
  const [pendingImage, setPendingImage] = useState<string | undefined>(undefined);

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

  const openAddModal = (img?: string, name: string = '') => {
    setPendingImage(img);
    setPendingFoodName(name);
    setPendingProtein('');
    setPendingCategory('Other');
    setIsInputModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const resized = await resizeImage(reader.result as string);
      openAddModal(resized);
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const protein = parseFloat(pendingProtein);
    if (!pendingFoodName.trim() || isNaN(protein)) return;

    const newMeal: MealLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      foodName: pendingFoodName,
      proteinGrams: Math.round(protein),
      category: pendingCategory,
      imageUrl: pendingImage
    };
    
    setMeals(prev => [newMeal, ...prev]);
    setIsInputModalOpen(false);
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
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
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
    <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col items-center">
      <div className="w-full max-w-md mx-auto bg-gray-800 rounded-lg shadow-lg flex flex-col h-screen relative">
        <header className="p-4 bg-gray-900 rounded-t-lg flex justify-between items-center border-b border-gray-800">
          <h1 className="text-xl font-bold text-teal-400">프로틴 트래커</h1>
          <div className="w-6"></div>
        </header>

        <main className="flex-grow p-4 overflow-y-auto">
          {currentView === 'daily' && (
            <>
              <div className="bg-gray-700 rounded-lg p-4 mb-4 shadow-inner">
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
                        className="w-20 bg-gray-800 text-white p-1 rounded border border-teal-500/30"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-teal-400">{goal}g</span>
                    )}
                  </div>
                  <button onClick={toggleEditGoal} className="p-1 rounded-full hover:bg-gray-600 text-gray-400">
                    {isEditingGoal ? <CheckIcon className="w-5 h-5" /> : <PencilIcon className="w-5 h-5" />}
                  </button>
                </div>
                <div className="w-full bg-gray-600 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-teal-500 h-4 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm mt-2 text-gray-300">
                  <span>{todayStats.protein.toFixed(0)}g 섭취</span>
                  <span>{Math.max(goal - todayStats.protein, 0).toFixed(0)}g 남음</span>
                </div>
                <p className="text-center mt-4 text-sm text-gray-400 italic font-medium">{getEncouragement()}</p>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-semibold flex items-center">
                  오늘의 식단 <span className="ml-2 text-xs font-normal text-gray-500">{todayMeals.length}개 항목</span>
                </h2>
                {todayMeals.length === 0 ? (
                  <div className="text-gray-500 text-center py-12 bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-700">
                    <p>아직 기록된 식단이 없습니다.</p>
                    <p className="text-xs mt-2 text-gray-600">아래 버튼으로 식사를 기록해보세요!</p>
                  </div>
                ) : (
                  todayMeals.map(meal => (
                    <div key={meal.id} className="bg-gray-700/50 hover:bg-gray-700 rounded-xl p-3 flex items-center space-x-3 transition-colors">
                      {meal.imageUrl && <img src={meal.imageUrl} alt={meal.foodName} className="w-16 h-16 rounded-lg object-cover shadow-md" />}
                      <div className="flex-grow min-w-0">
                        <div className="flex justify-between items-start">
                          <p className="font-semibold truncate">{meal.foodName}</p>
                          <span className="text-lg font-bold text-teal-400 whitespace-nowrap ml-2">{meal.proteinGrams}g</span>
                        </div>
                        <div className="flex justify-between items-end text-xs text-gray-400 mt-1">
                           <span className="bg-gray-800 px-2 py-0.5 rounded text-teal-500/80">{meal.category}</span>
                           <div className="flex items-center space-x-2">
                              <span>{formatTime(meal.timestamp)}</span>
                              <button onClick={() => deleteMeal(meal.id)} className="p-1.5 hover:text-red-500 transition-colors bg-gray-800 rounded-md">
                                <TrashIcon className="w-3.5 h-3.5" />
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
            <div className="h-full flex flex-col fade-in">
              <h2 className="text-lg font-semibold mb-4">섭취 기록 리포트</h2>
              <div className="flex justify-center bg-gray-700 p-1 rounded-xl mb-6">
                <button onClick={() => setHistoryPeriod('week')} className={`px-4 py-2 rounded-lg text-sm font-bold w-1/2 transition-all ${historyPeriod === 'week' ? 'bg-teal-500 text-white shadow-lg' : 'text-gray-400'}`}>주간</button>
                <button onClick={() => setHistoryPeriod('month')} className={`px-4 py-2 rounded-lg text-sm font-bold w-1/2 transition-all ${historyPeriod === 'month' ? 'bg-teal-500 text-white shadow-lg' : 'text-gray-400'}`}>월간</button>
              </div>
              <div className="mb-6 h-56 bg-gray-700/30 rounded-xl p-4 flex items-end justify-around border border-gray-700">
                {historyData.map((d, i) => (
                  <div key={i} className="flex flex-col items-center w-full h-full justify-end" onClick={() => historyPeriod === 'week' && setSelectedHistoryDate(d.date)}>
                    <div className="h-4/5 w-full flex items-end justify-center relative group">
                      <div 
                        className={`w-3/5 rounded-t-lg transition-all duration-500 cursor-pointer ${selectedHistoryDate === d.date ? 'bg-teal-400 ring-2 ring-teal-200' : 'bg-teal-600 group-hover:bg-teal-500'}`}
                        style={{ height: `${Math.min(100, (d.totalProtein / (historyPeriod === 'week' ? goal : (goal * 30))) * 100)}%`}}
                      ></div>
                    </div>
                    <span className="text-[10px] mt-2 text-gray-500 font-medium">
                      {historyPeriod === 'week' ? new Date(d.date).getDate() + '일' : new Date(d.date + '-02').toLocaleString('default', { month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>

              {selectedHistoryDate && (
                 <div className="slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-3 bg-gray-900 p-3 rounded-xl border border-gray-700">
                      <h3 className="font-bold text-teal-400">{new Date(selectedHistoryDate).toLocaleDateString('ko-KR')} 상세</h3>
                      <button onClick={() => setSelectedHistoryDate(null)} className="p-1 bg-gray-800 rounded-full"><XMarkIcon className="w-4 h-4" /></button>
                    </div>
                    <div className="space-y-2">
                    {meals.filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === selectedHistoryDate).length > 0 ? (
                      meals.filter(m => new Date(m.timestamp).toLocaleDateString('sv-SE') === selectedHistoryDate)
                      .sort((a, b) => b.timestamp - a.timestamp)
                      .map(meal => (
                        <div key={meal.id} className="bg-gray-700/40 rounded-xl p-3 flex items-center space-x-3 border border-gray-700/50">
                          {meal.imageUrl && <img src={meal.imageUrl} alt={meal.foodName} className="w-12 h-12 rounded-lg object-cover" />}
                          <div className="flex-grow min-w-0">
                            <p className="font-semibold text-sm truncate">{meal.foodName}</p>
                            <p className="text-[10px] text-gray-500 uppercase">{meal.category} • {formatTime(meal.timestamp)}</p>
                          </div>
                          <span className="font-bold text-teal-400">{meal.proteinGrams}g</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center py-4 bg-gray-700/20 rounded-xl">기록이 없습니다.</p>
                    )}
                    </div>
                 </div>
              )}
            </div>
          )}
        </main>
        
        {currentView === 'daily' && (
          <div className="px-4 pb-6 pt-2 bg-gray-900/50 backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center py-4 rounded-2xl bg-teal-600 hover:bg-teal-500 shadow-lg transition-all active:scale-95 group"
              >
                <div className="bg-white/10 p-2 rounded-xl group-hover:bg-white/20 mb-1 transition-colors">
                  <CameraIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold">카메라</span>
              </button>
              <button
                onClick={() => albumInputRef.current?.click()}
                className="flex flex-col items-center justify-center py-4 rounded-2xl bg-teal-600 hover:bg-teal-500 shadow-lg transition-all active:scale-95 group"
              >
                <div className="bg-white/10 p-2 rounded-xl group-hover:bg-white/20 mb-1 transition-colors">
                  <PhotoIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold">앨범</span>
              </button>
              <button
                onClick={() => openAddModal()}
                className="flex flex-col items-center justify-center py-4 rounded-2xl bg-teal-600 hover:bg-teal-500 shadow-lg transition-all active:scale-95 group"
              >
                <div className="bg-white/10 p-2 rounded-xl group-hover:bg-white/20 mb-1 transition-colors">
                  <PencilSquareIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold">직접 입력</span>
              </button>
            </div>
          </div>
        )}

        <footer className="p-1 bg-gray-900 rounded-b-lg mt-auto flex justify-around border-t border-gray-800">
          <button onClick={() => setCurrentView('daily')} className={`flex flex-col items-center py-3 w-1/2 rounded-xl transition-all ${currentView === 'daily' ? 'text-teal-400 bg-teal-400/5' : 'text-gray-500 hover:text-gray-400'}`}>
            <HomeIcon className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-bold uppercase tracking-wider">오늘</span>
          </button>
          <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center py-3 w-1/2 rounded-xl transition-all ${currentView === 'history' ? 'text-teal-400 bg-teal-400/5' : 'text-gray-500 hover:text-gray-400'}`}>
            <ChartBarIcon className="w-6 h-6" />
            <span className="text-[10px] mt-1 font-bold uppercase tracking-wider">기록</span>
          </button>
        </footer>

        {isInputModalOpen && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center z-50 p-4 fade-in">
            <div className="bg-gray-800 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-700 slide-in-from-bottom-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">식단 정보 입력</h3>
                <button onClick={() => setIsInputModalOpen(false)} className="p-2 rounded-full hover:bg-gray-700 bg-gray-900 transition-colors">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveMeal}>
                {pendingImage && (
                  <div className="mb-6">
                    <img src={pendingImage} alt="Preview" className="w-full h-40 object-cover rounded-2xl border border-gray-700 shadow-lg" />
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">음식 이름</label>
                    <input
                      type="text"
                      value={pendingFoodName}
                      onChange={(e) => setPendingFoodName(e.target.value)}
                      placeholder="무엇을 드셨나요?"
                      className="w-full bg-gray-900 text-white p-4 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:outline-none border border-gray-700 transition-all placeholder:text-gray-600"
                      autoFocus={!pendingImage}
                      required
                    />
                  </div>
                  <div className="flex space-x-3">
                    <div className="flex-grow">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">단백질 함량 (g)</label>
                      <input
                        type="number"
                        value={pendingProtein}
                        onChange={(e) => setPendingProtein(e.target.value)}
                        placeholder="0"
                        className="w-full bg-gray-900 text-white p-4 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:outline-none border border-gray-700 transition-all placeholder:text-gray-600"
                        required
                      />
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">식사 분류</label>
                      <select
                        value={pendingCategory}
                        onChange={(e) => setPendingCategory(e.target.value as MealCategory)}
                        className="w-full bg-gray-900 text-white p-4 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:outline-none border border-gray-700 transition-all appearance-none"
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
                  className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center mt-8 shadow-lg active:scale-95 transition-all"
                >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  기록 저장하기
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
