/**
 * 平甩功計數計時鍛鍊系統 - 音效模式升級版
 * 1. 四大音效模式：禪意、柔和、金屬、滴水
 * 2. 預讀排程系統 (Look-ahead Scheduler)
 * 3. Media Session API 與 Zen Mode
 */

// --- 全域變數 ---
let audioCtx = null;
let masterGain = null;
let compressor = null;
let isRunning = false;
let currentCount = 0; 
let totalSwings = 0;
let totalDuration = 1200; 
let timeRemaining = 1200;
let frequency = parseInt(localStorage.getItem('ping-shuai-freq')) || 40;
let soundMode = localStorage.getItem('ping-shuai-sound-mode') || 'zen';
let wakeLock = null;

// 排程器相關
let nextNoteTime = 0.0;     
let timerID = null;         
const lookahead = 0.1;      
const scheduleInterval = 25; 

// --- DOM 元素 ---
const bigCounter = document.getElementById('big-counter');
const zenBigCounter = document.getElementById('zen-big-counter');
const totalCounterDisplay = document.getElementById('total-counter');
const actionHint = document.getElementById('action-hint');
const timeDisplay = document.getElementById('time-display');
const progressBar = document.getElementById('progress-bar');
const startPauseBtn = document.getElementById('start-pause-btn');
const resetBtn = document.getElementById('reset-btn');
const freqSlider = document.getElementById('freq-slider');
const freqValue = document.getElementById('freq-value');
const sessionStatus = document.getElementById('session-status');
const wakelockStatus = document.getElementById('wakelock-status');
const mascotContainer = document.getElementById('mascot-container');
const zenBtn = document.getElementById('zen-btn');
const zenOverlay = document.getElementById('zen-overlay');

// --- Modal 元素 ---
const customTimeBtn = document.getElementById('custom-time-btn');
const customModal = document.getElementById('custom-modal');
const customMinutesInput = document.getElementById('custom-minutes');
const confirmCustomBtn = document.getElementById('confirm-custom');
const cancelCustomBtn = document.getElementById('cancel-custom');

// --- 音頻引擎與音效合成 ---
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // 建立主增益節點 (Master Gain)
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(1.8, audioCtx.currentTime); // 預設 1.8 倍增益
    
    // 建立動態壓縮器 (DynamicsCompressor) 防止破音
    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, audioCtx.currentTime);
    compressor.knee.setValueAtTime(40, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
    
    // 連接鏈：音效 -> masterGain -> compressor -> destination
    masterGain.connect(compressor);
    compressor.connect(audioCtx.destination);
  }
}

/**
 * 核心合成器
 */
function playTone(params) {
  const { freq, type = 'sine', decay = 0.5, resonance = 5, vol = 0.8, filterType = 'bandpass', attack = 0.005 } = params;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, params.time);
  
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, params.time);
  filter.Q.setValueAtTime(resonance, params.time);
  
  gain.gain.setValueAtTime(0, params.time);
  gain.gain.linearRampToValueAtTime(vol, params.time + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, params.time + decay);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain || audioCtx.destination);
  
  osc.start(params.time);
  osc.stop(params.time + decay);
}



function scheduleNote(countIndex, time) {
  const isSquat = countIndex === 4;

  switch (soundMode) {
    case 'zen':
      if (!isSquat) {
        playTone({ freq: 880, type: 'triangle', decay: 0.1, resonance: 10, time });
      } else {
        // 禪意二次強化：衝擊層 + 主體層 + 底蘊層
        // 1. 衝擊層 (Impact/Click) - 極短高頻讓耳朵捕捉節拍
        playTone({ freq: 1760, type: 'triangle', decay: 0.05, vol: 0.6, time });
        // 2. 主體層 (Body) - 響亮的中低音 (E4)，在多數喇叭表現較佳
        playTone({ freq: 330, type: 'triangle', decay: 1.2, resonance: 10, vol: 1.5, time });
        // 3. 底蘊層 (Depth) - 增加厚度
        playTone({ freq: 110, type: 'sine', decay: 0.8, vol: 1.2, time });
      }
      break;
      
    case 'soft':
      if (!isSquat) {
        playTone({ freq: 330, type: 'sine', decay: 0.2, filterType: 'lowpass', time, vol: 0.7 });
      } else {
        // 下蹲強化：頻率微調提高增加聽感亮度，音量大幅提升
        playTone({ freq: 185, type: 'sine', decay: 1.2, filterType: 'lowpass', time, vol: 1.5 });
      }
      break;
      
    case 'nature':
      if (!isSquat) {
        // 水滴聲 (快速頻率偏移)
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(1200, time);
        osc.frequency.exponentialRampToValueAtTime(1800, time + 0.05);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.8, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(gain);
        gain.connect(masterGain || audioCtx.destination);
        osc.start(time);
        osc.stop(time + 0.1);
      } else {
        // 強化滴水感：深水滴 (Deep Plop)
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, time);
        filter.frequency.exponentialRampToValueAtTime(100, time + 0.2);
        
        osc.frequency.setValueAtTime(600, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.15);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(2.0, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain || audioCtx.destination);
        osc.start(time);
        osc.stop(time + 0.5);
      }
      break;
    case 'oral':
      // 口語模式：1, 2, 3, 4, 蹲
      // 在計時器的 setTimeout 中觸發語音，以與 UI 同步
      break;
    default:
      // 預設為禪意
      if (!isSquat) {
        playTone({ freq: 880, type: 'triangle', decay: 0.1, resonance: 10, time });
      } else {
        // 預設與禪意強化同步
        playTone({ freq: 1760, type: 'triangle', decay: 0.05, vol: 0.6, time });
        playTone({ freq: 330, type: 'triangle', decay: 1.2, resonance: 10, vol: 1.5, time });
        playTone({ freq: 110, type: 'sine', decay: 0.8, vol: 1.2, time });
      }
      break;
  }

  const delay = (time - audioCtx.currentTime) * 1000;
  setTimeout(() => {
    if (!isRunning) return;
    totalSwings++;

    // 如果是口語模式，在這裡觸發語音
    if (soundMode === 'oral') {
      speakCount(countIndex);
    }

    updateUI(countIndex);
  }, Math.max(0, delay));
}

/**
 * 語音合成輔助函數
 */
function speakCount(index) {
  if (!('speechSynthesis' in window)) return;
  
  // 在某些手機瀏覽器，重複呼叫 cancel 會導致後續語音失效
  // 只有當正在說話時才嘗試取消
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  
  const labels = ['一', '二', '三', '四', '蹲'];
  const utterance = new SpeechSynthesisUtterance(labels[index]);
  
  // 設定語音參數
  utterance.lang = 'zh-TW';
  // 如果 zh-TW 不存在，嘗試簡化為 zh
  utterance.onerror = (e) => {
    if (utterance.lang === 'zh-TW') {
      utterance.lang = 'zh-CN'; // 至少有聲音
      window.speechSynthesis.speak(utterance);
    }
  };

  utterance.rate = 1.3; // 稍微再快一點點，避免延遲
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  window.speechSynthesis.speak(utterance);
}

function scheduler() {
  while (nextNoteTime < audioCtx.currentTime + lookahead) {
    scheduleNote(currentCount, nextNoteTime);
    const secondsPerBeat = 60.0 / frequency;
    nextNoteTime += secondsPerBeat;
    currentCount = (currentCount + 1) % 5;
  }
}

// --- 其餘功能與初始化 ---
function updateMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '平甩功鍛鍊中',
      artist: '李鳳山師父平甩功',
      artwork: [{ src: 'https://gongminshenliyuchiutiger.github.io/__public-useful__/image/LiyuChill.svg', sizes: '512x512', type: 'image/svg+xml' }]
    });
    navigator.mediaSession.setActionHandler('play', startExercise);
    navigator.mediaSession.setActionHandler('pause', pauseExercise);
  }
}

function updateUI(countIndex) {
  const labels = ['1', '2', '3', '4', '蹲'];
  bigCounter.textContent = labels[countIndex];
  zenBigCounter.textContent = labels[countIndex];
  actionHint.textContent = countIndex === 4 ? '雙蹲' : '甩手';
  totalCounterDisplay.textContent = totalSwings;
  
  if (countIndex === 4) {
    bigCounter.classList.add('squat-active');
    actionHint.classList.add('squat-active');
  } else {
    bigCounter.classList.remove('squat-active');
    actionHint.classList.remove('squat-active');
  }

  mascotContainer.classList.remove('beating');
  void mascotContainer.offsetWidth; 
  mascotContainer.classList.add('beating');
}

function updateTimerDisplay() {
  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  progressBar.style.width = `${(timeRemaining / totalDuration) * 100}%`;
}

function tickTimer() {
  if (!isRunning) return;
  if (timeRemaining > 0) {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) {
      stopExercise();
      playTone({ freq: 440, time: audioCtx.currentTime, decay: 2, vol: 0.5 });
      alert('「平甩功」鍛鍊結束！身心舒暢，功德圓滿。');
    }
  }
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakelockStatus.classList.add('active');
    } catch (err) {}
  }
}

function startExercise() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  requestWakeLock();
  updateMediaSession();
  isRunning = true;
  nextNoteTime = audioCtx.currentTime;
  
  // 手機版語音啟動 (User Gesture 授權)
  if ('speechSynthesis' in window) {
    const silentUtterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(silentUtterance);
  }

  startPauseBtn.innerHTML = '<i class="fas fa-pause"></i> <span>暫停鍛鍊</span>';
  timerID = setInterval(scheduler, scheduleInterval);
  secondTimerID = setInterval(tickTimer, 1000);
}

function pauseExercise() {
  isRunning = false;
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
  wakelockStatus.classList.remove('active');
  clearInterval(timerID);
  clearInterval(secondTimerID);
  startPauseBtn.innerHTML = '<i class="fas fa-play"></i> <span>繼續鍛鍊</span>';
}

function stopExercise() {
  isRunning = false;
  clearInterval(timerID);
  clearInterval(secondTimerID);
  startPauseBtn.innerHTML = '<i class="fas fa-play"></i> <span>開始鍛鍊</span>';
}

function resetExercise() {
  pauseExercise();
  timeRemaining = totalDuration;
  totalSwings = 0;
  currentCount = 0;
  bigCounter.textContent = '0';
  updateTimerDisplay();
  totalCounterDisplay.textContent = '0';
}

// --- 事件處理 ---
startPauseBtn.addEventListener('click', () => {
  if (isRunning) pauseExercise();
  else startExercise();
});

resetBtn.addEventListener('click', resetExercise);

freqSlider.addEventListener('input', (e) => {
  frequency = e.target.value;
  freqValue.textContent = `${frequency} 次/分`;
  localStorage.setItem('ping-shuai-freq', frequency);
});

// 音效按鈕事件
document.querySelectorAll('.sound-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    soundMode = btn.dataset.mode;
    localStorage.setItem('ping-shuai-sound-mode', soundMode);
    
    // 試聽一聲
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // 手機版語音試聽預熱
    if (soundMode === 'oral' && 'speechSynthesis' in window) {
      const silentUtterance = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(silentUtterance);
    }
    
    scheduleNote(0, audioCtx.currentTime + 0.05);
  });
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.id === 'custom-time-btn') return;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    totalDuration = parseInt(btn.dataset.time);
    resetExercise();
  });
});

zenBtn.addEventListener('click', () => zenOverlay.classList.add('active'));
zenOverlay.addEventListener('click', () => zenOverlay.classList.remove('active'));

// 自訂時間 Modal 邏輯
customTimeBtn.addEventListener('click', () => {
    customModal.classList.add('active');
});

cancelCustomBtn.addEventListener('click', () => {
    customModal.classList.remove('active');
});

confirmCustomBtn.addEventListener('click', () => {
    const mins = parseInt(customMinutesInput.value);
    if (isNaN(mins) || mins < 1 || mins > 180) {
        alert('請輸入 1 到 180 之間的分鐘數。');
        return;
    }
    
    totalDuration = mins * 60;
    
    // 更新按鈕狀態
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    customTimeBtn.classList.add('active');
    
    customModal.classList.remove('active');
    resetExercise();
});

// 吉祥物拖曳
let isDragging = false;
let startX, startY;
mascotContainer.addEventListener('pointerdown', (e) => {
  isDragging = true;
  mascotContainer.style.transition = 'none';
  startX = e.clientX - mascotContainer.offsetLeft;
  startY = e.clientY - mascotContainer.offsetTop;
  mascotContainer.setPointerCapture(e.pointerId);
});
mascotContainer.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  mascotContainer.style.left = `${e.clientX - startX}px`;
  mascotContainer.style.top = `${e.clientY - startY}px`;
  mascotContainer.style.bottom = 'auto';
  mascotContainer.style.right = 'auto';
});
mascotContainer.addEventListener('pointerup', () => isDragging = false);

// 初始化
function init() {
  freqSlider.value = frequency;
  freqValue.textContent = `${frequency} 次/分`;
  
  // 如果舊有的設定是已移除的 'metallic'，強制改回 'zen'
  if (soundMode === 'metallic') {
    soundMode = 'zen';
    localStorage.setItem('ping-shuai-sound-mode', soundMode);
  }
  
  // 恢復音效模式按鈕狀態
  document.querySelectorAll('.sound-btn').forEach(btn => {
    if (btn.dataset.mode === soundMode) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  
  // 初始化語音引擎 (預讀取語音清單，對手機版相容性有助益)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }

  updateTimerDisplay();
}

init();
