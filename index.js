import { GoogleGenAI } from "@google/genai";

// --- AUTHENTICATION & DATA SETUP ---
// The API key is now handled by the environment, simplifying the user experience.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- ICONS & ILLUSTRATIONS (SVG) ---
const icons = {
  book: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  celebration: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
    <path d="M60 110 C 60 120, 140 120, 140 110 L 140 90 L 60 90 Z" fill="#FFD700" />
    <rect x="85" y="60" width="30" height="30" fill="#FFD700" />
    <path d="M 50 90 C 40 70, 70 50, 85 60" fill="none" stroke="#FFD700" stroke-width="4" stroke-linecap="round" />
    <path d="M 150 90 C 160 70, 130 50, 115 60" fill="none" stroke="#FFD700" stroke-width="4" stroke-linecap="round" />
    <circle cx="40" cy="30" r="5" fill="#FF6347"/>
    <circle cx="160" cy="40" r="5" fill="#32CD32"/>
    <path d="M 70 20 L 75 25 L 70 30" stroke="#007AFF" stroke-width="3" fill="none" />
    <path d="M 130 15 L 125 20 L 130 25" stroke="#FF6347" stroke-width="3" fill="none" />
    <rect x="150" y="70" width="10" height="10" fill="#007AFF" transform="rotate(45 155 75)"/>
  </svg>`,
};


// --- STATE MANAGEMENT ---
const initialState = {
  // App state
  currentPage: 'main',
  
  // Planner Core state
  subjects: [],
  totalPoints: 0,
  newSubject: '',
  nextId: 1,
  nextRecordId: 1,
  studyRecords: [],
  
  // Page and timer state
  studyingSubjectId: null,
  activeTimerId: null,
  
  // Chat state
  chat: null,
  chatHistory: [],
  chatInput: '',
  isAnswering: false,

  // UI state
  isLoading: false,
  motivationalMessage: '',
  showFinishModal: false,
  finishedSubjectInfo: null,
};

let state = { ...initialState };

// --- UTILITY FUNCTIONS ---
const formatTime = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map(v => v.toString().padStart(2, '0'))
    .join(':');
};

// --- API FUNCTIONS ---
async function getMotivationMessage(subjectName, timeString) {
  try {
    setState({ isLoading: true, motivationalMessage: '' });
    const prompt = `A student just studied '${subjectName}' for ${timeString}. Write a short, creative, and encouraging message for them in Korean. Be cheerful and inspiring.`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    setState({ motivationalMessage: response.text });
  } catch (error) {
    console.error("Error getting motivational message:", error);
    setState({ motivationalMessage: "오늘도 정말 수고 많았어요! 꾸준함이 최고의 무기랍니다." });
  } finally {
    setState({ isLoading: false });
  }
}


// --- DOM MANIPULATION & EVENT HANDLERS ---
const setState = (newState) => {
  state = { ...state, ...newState };
  render();
};

const saveData = () => {
    try {
        const plannerData = {
            subjects: state.subjects,
            totalPoints: state.totalPoints,
            studyRecords: state.studyRecords,
            nextId: state.nextId,
            nextRecordId: state.nextRecordId,
        };
        localStorage.setItem('plannerData', JSON.stringify(plannerData));
    } catch(e) {
        console.error("Could not save planner data", e);
    }
};

const handleReset = () => {
    if(confirm('정말로 모든 공부 기록을 초기화하시겠어요? 이 작업은 되돌릴 수 없습니다.')) {
        localStorage.removeItem('plannerData');
        setState({ ...initialState });
    }
};

const handleAddSubject = (e) => {
  e.preventDefault();
  if (state.newSubject.trim()) {
    const newSubject = {
      id: state.nextId,
      name: state.newSubject.trim(),
      status: 'pending',
      elapsedTime: 0,
    };
    setState({
      subjects: [...state.subjects, newSubject],
      newSubject: '',
      nextId: state.nextId + 1,
    });
    document.getElementById('subject-input')?.focus();
  }
};

const handleStartStudy = (id) => {
  if (state.activeTimerId) return;

  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
        systemInstruction: 'You are a helpful study assistant. Keep your answers concise and accurate in Korean.',
    },
  });
  
  const timerId = setInterval(() => {
    const studyingSubject = state.subjects.find(s => s.id === state.studyingSubjectId);
    if(studyingSubject) {
        setState({ subjects: state.subjects.map(s => s.id === id ? {...s, elapsedTime: s.elapsedTime + 1} : s) });
    }
  }, 1000);
  
  setState({ 
      activeTimerId: timerId, 
      motivationalMessage: '',
      currentPage: 'timer',
      studyingSubjectId: id,
      chat: chat,
      chatHistory: [],
  });
};

const handleFinishStudy = (id) => {
    if (state.activeTimerId) {
        clearInterval(state.activeTimerId);
    }
    const subject = state.subjects.find(s => s.id === id);
    if(!subject) return;

    const finishedInfo = {
        id: subject.id,
        name: subject.name,
        timeString: formatTime(subject.elapsedTime),
    };

    setState({ 
        activeTimerId: null,
        showFinishModal: true,
        finishedSubjectInfo: finishedInfo,
    });
};

const handleConfirmFinish = () => {
    if(!state.finishedSubjectInfo) return;
    const { id } = state.finishedSubjectInfo;

    const subjects = state.subjects.map(s =>
        s.id === id ? { ...s, status: 'finished' } : s
    );

    setState({
        subjects,
        currentPage: 'main',
        studyingSubjectId: null,
        chat: null,
        chatInput: '',
        showFinishModal: false,
        finishedSubjectInfo: null,
    })
};


const handlePhotoUpload = (id, file) => {
    const subject = state.subjects.find(s => s.id === id);
    if (!subject || !file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imgSrc = e.target?.result;
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 800 / img.width;
            canvas.width = 800;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const timeString = formatTime(subject.elapsedTime);
            const today = new Date();
            const dateString = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
            
            const dateText = dateString;
            const studyText = `${subject.name} - ${timeString}`;

            const fontSize = canvas.width * 0.045;
            ctx.font = `bold ${fontSize}px 'Noto Sans KR'`;
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 4;
            ctx.textAlign = 'center';

            const textX = canvas.width / 2;
            const bottomMargin = canvas.height * 0.05;
            const lineHeight = fontSize * 1.2;

            const studyTextY = canvas.height - bottomMargin;
            const dateTextY = studyTextY - lineHeight;

            ctx.strokeText(studyText, textX, studyTextY);
            ctx.fillText(studyText, textX, studyTextY);

            ctx.strokeText(dateText, textX, dateTextY);
            ctx.fillText(dateText, textX, dateTextY);
            
            const stampedImageSrc = canvas.toDataURL('image/jpeg');
            const points = Math.max(1, Math.floor(subject.elapsedTime / 60));
            
            const newRecord = {
                id: state.nextRecordId,
                subjectName: subject.name,
                timeString,
                imageSrc: stampedImageSrc,
                points
            };

            setState({
                subjects: state.subjects.map(s => s.id === id ? {...s, status: 'completed'} : s),
                totalPoints: state.totalPoints + points,
                studyRecords: [...state.studyRecords, newRecord],
                nextRecordId: state.nextRecordId + 1,
            });

            getMotivationMessage(subject.name, timeString);
        };
        img.src = imgSrc;
    };
    reader.readAsDataURL(file);
};

const handleChatSubmit = async (e) => {
    e.preventDefault();
    const prompt = state.chatInput.trim();
    if (!prompt || !state.chat || state.isAnswering) return;

    const newHistory = [...state.chatHistory, { role: 'user', text: prompt }];
    setState({ chatInput: '', isAnswering: true, chatHistory: newHistory });

    try {
        const response = await state.chat.sendMessage({ message: prompt });
        const modelResponse = response.text;
        const updatedHistory = [...newHistory, { role: 'model', text: modelResponse }];
        setState({ chatHistory: updatedHistory, isAnswering: false });
    } catch (error) {
        console.error("Chat error:", error);
        const errorHistory = [...newHistory, { role: 'model', text: '죄송합니다. 오류가 발생했어요. 다시 시도해 주세요.' }];
        setState({ chatHistory: errorHistory, isAnswering: false });
    }
};


// --- RENDER FUNCTIONS ---
const root = document.getElementById('root');

const renderMainPage = () => {
    const isStudying = !!state.studyingSubjectId;
    const totalStudySeconds = state.subjects.reduce((total, subject) => total + subject.elapsedTime, 0);
    const totalStudyTimeString = formatTime(totalStudySeconds);

    return `
    <div class="app-container">
      <header class="header header-main">
        <div class="reset-container">
          <button class="btn btn-reset" data-action="reset">초기화</button>
        </div>
        <h1>나의 공부 플래너</h1>
        <div class="header-stats">
            <div class="stat-item">
                ${icons.star}
                <span>${state.totalPoints} P</span>
            </div>
            <div class="stat-item">
                ${icons.clock}
                <span>총 ${totalStudyTimeString}</span>
            </div>
        </div>
      </header>
      
      <main>
        <section class="card">
          <h2>오늘의 공부 계획</h2>
          <form class="subject-input-form" id="add-subject-form">
            <input type="text" id="subject-input" class="subject-input" placeholder="공부할 과목을 입력하세요" value="${state.newSubject}">
            <button type="submit" class="btn btn-primary">추가</button>
          </form>
          <ul class="subject-list">
            ${state.subjects.length === 0 ? '<p class="empty-list-message">오늘 공부할 과목을 추가해 보세요!</p>' : ''}
            ${state.subjects.map(s => `
              <li class="subject-item ${s.status}">
                <div class="subject-info">
                  <span class="subject-icon">${s.status === 'completed' ? icons.check : icons.book}</span>
                  <span class="subject-name">${s.name}</span>
                </div>
                <div class="subject-controls">
                  ${s.status === 'pending' ? `<button class="btn btn-primary" data-action="start" data-id="${s.id}" ${isStudying ? 'disabled' : ''}>시작</button>` : ''}
                  ${s.status === 'finished' ? `
                    <span>${formatTime(s.elapsedTime)}</span>
                    <label class="btn btn-secondary photo-upload-label">
                      인증하기
                      <input type="file" accept="image/*" class="photo-upload-input" data-action="upload" data-id="${s.id}">
                    </label>
                  ` : ''}
                  ${s.status === 'completed' ? `<span class="completed-text">완료!</span>` : ''}
                </div>
              </li>
            `).join('')}
          </ul>
        </section>

        ${state.motivationalMessage ? `<div class="motivational-message card">${state.motivationalMessage}</div>` : ''}

        <section class="card">
            <h2>나의 공부 기록</h2>
            ${state.studyRecords.length === 0 ? '<p class="empty-list-message">아직 공부 기록이 없어요.</p>' : ''}
            <div class="study-records-grid">
              ${state.studyRecords.slice().reverse().map(r => `
                <div class="record-card">
                  <img src="${r.imageSrc}" alt="${r.subjectName} 공부 기록">
                  <div class="record-info">
                    <p>${r.subjectName} - ${r.timeString}</p>
                    <p class="points-earned">+${r.points} P</p>
                  </div>
                </div>
              `).join('')}
            </div>
        </section>
      </main>
    </div>
    `;
};

const renderTimerPage = () => {
    const subject = state.subjects.find(s => s.id === state.studyingSubjectId);
    if (!subject) return `<div class="error-page">오류: 과목을 찾을 수 없습니다.</div>`;

    return `
    <div class="timer-page-container">
        <header class="timer-header">
            <h3>집중모드</h3>
            <button class="btn-close" data-action="finish" data-id="${subject.id}">&times;</button>
        </header>

        <section class="timer-visual-section">
            <div class="timer-illustration">
                ${icons.book}
            </div>
            <h2 class="timer-subject-name">${subject.name}</h2>
            <div class="timer-display">${formatTime(subject.elapsedTime)}</div>
            <button class="btn btn-danger btn-finish-study" data-action="finish" data-id="${subject.id}">공부 종료</button>
        </section>
        
        <section class="chat-section">
            <div class="chat-header">AI 튜터에게 질문하기</div>
            <div class="chat-history">
                ${state.chatHistory.map(msg => `
                    <div class="chat-message ${msg.role}-message">${msg.text}</div>
                `).join('')}
                ${state.isAnswering ? `
                    <div class="chat-message model-message">
                        <div class="spinner" style="width:20px;height:20px;margin:0;"></div>
                    </div>` : ''
                }
            </div>
            <form class="chat-input-form" id="chat-form">
                <input type="text" id="chat-input" placeholder="궁금한 것을 물어보세요..." value="${state.chatInput}" autocomplete="off">
                <button type="submit" class="btn btn-primary" ${state.isAnswering ? 'disabled' : ''}>전송</button>
            </form>
        </section>
    </div>
    `;
};

const renderFinishModal = () => {
    if (!state.showFinishModal || !state.finishedSubjectInfo) return '';
    return `
    <div class="modal-overlay">
        <div class="modal-content card">
            <div class="modal-illustration">
                ${icons.celebration}
            </div>
            <h2>목표 달성!</h2>
            <p class="finish-time-display">
                ${state.finishedSubjectInfo.name}: ${state.finishedSubjectInfo.timeString}
            </p>
            <p>정말 수고하셨습니다!</p>
            <button class="btn btn-primary" data-action="confirm-finish">확인</button>
        </div>
    </div>
    `;
};


const render = () => {
  // Save data on every render to persist state
  saveData();

  const activeElement = document.activeElement;
  const activeElementId = activeElement?.id;
  const selectionStart = activeElement?.selectionStart;
  const selectionEnd = activeElement?.selectionEnd;

  let pageHtml = '';
  switch (state.currentPage) {
      case 'main':
          pageHtml = renderMainPage();
          break;
      case 'timer':
          pageHtml = renderTimerPage();
          break;
  }

  root.innerHTML = pageHtml + renderFinishModal() + `
    ${state.isLoading ? `
      <div class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p>AI가 응원 메시지를 만들고 있어요...</p>
        </div>
      </div>
    ` : ''}
  `;

  // --- ADD EVENT LISTENERS ---
  if (state.currentPage === 'main') {
    document.getElementById('add-subject-form')?.addEventListener('submit', handleAddSubject);
    const subjectInput = document.getElementById('subject-input');
    if(subjectInput) {
        subjectInput.addEventListener('input', (e) => {
            state.newSubject = e.target.value;
        });
    }
  } else if(state.currentPage === 'timer') {
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', handleChatSubmit);
        const chatInput = document.getElementById('chat-input');
        chatInput?.addEventListener('input', (e) => {
            state.chatInput = e.target.value;
        });
    }
    const chatHistoryEl = document.querySelector('.chat-history');
    if(chatHistoryEl) chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  }
  
  document.querySelectorAll('[data-action]').forEach(el => {
    const action = el.getAttribute('data-action');
    const id = Number(el.getAttribute('data-id'));
    
    switch(action) {
        case 'start':
            el.addEventListener('click', () => handleStartStudy(id));
            break;
        case 'finish':
            el.addEventListener('click', () => handleFinishStudy(id));
            break;
        case 'confirm-finish':
            el.addEventListener('click', handleConfirmFinish);
            break;
        case 'upload':
            el.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(id, file);
            });
            break;
        case 'reset':
            el.addEventListener('click', handleReset);
            break;
    }
  });

  // Restore focus
  if (activeElementId) {
      const newActiveElement = document.getElementById(activeElementId);
      if (newActiveElement) {
          newActiveElement.focus();
          if (selectionStart !== null && selectionEnd !== null && newActiveElement.tagName === 'INPUT') {
              newActiveElement.setSelectionRange(selectionStart, selectionEnd);
          }
      }
  }
};

const initializeApp = () => {
    try {
        const savedData = localStorage.getItem('plannerData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            setState({ ...state, ...parsedData });
        } else {
             render();
        }
    } catch(e) {
        console.error("Failed to initialize app state:", e);
        localStorage.clear();
        setState({ ...initialState });
    }
};

// Initial Load
initializeApp();
