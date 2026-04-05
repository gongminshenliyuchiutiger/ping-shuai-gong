/**
 * 平甩功計數計時鍛鍊系統 - 音效模式升級版
 * 1. 四大音效模式：禪意、柔和、金屬、滴水
 * 2. 預讀排程系統 (Look-ahead Scheduler)
 * 3. Media Session API 與 Zen Mode
 */

// --- 全域變數 ---
let audioCtx = null;
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

// --- 音頻引擎與音效合成 ---
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

/**
 * 核心合成器
 */
function playTone(params) {
  const { freq, type = 'sine', decay = 0.5, resonance = 5, vol = 0.6, filterType = 'bandpass', attack = 0.005 } = params;
  
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
  gain.connect(audioCtx.destination);
  
  osc.start(params.time);
  osc.stop(params.time + decay);
}

/**
 * 金屬音色合成器 (加法合成)
 */
function playMetallicTone(freq, time, decay = 1.0, vol = 0.4) {
  // 模擬不諧和諧音
  const ratios = [1, 1.5, 2.3, 3.1];
  ratios.forEach((ratio, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * ratio, time);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol / (i + 1), time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay / (i + 1));
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + decay);
  });
}

function scheduleNote(countIndex, time) {
  const isSquat = countIndex === 4;

  switch (soundMode) {
    case 'zen':
      if (!isSquat) playTone({ freq: 880, type: 'triangle', decay: 0.1, resonance: 10, time });
      else playTone({ freq: 220, type: 'triangle', decay: 0.8, resonance: 5, vol: 0.7, time });
      break;
      
    case 'soft':
      if (!isSquat) playTone({ freq: 330, type: 'sine', decay: 0.2, filterType: 'lowpass', time, vol: 0.4 });
      else playTone({ freq: 165, type: 'sine', decay: 1.0, filterType: 'lowpass', time, vol: 0.5 });
      break;
      
    case 'metallic':
      if (!isSquat) playMetallicTone(1200, time, 0.3, 0.3); // 銅鈴
      else playMetallicTone(110, time, 2.0, 0.6); // 大鐘
      break;
      
    case 'nature':
      if (!isSquat) {
        // 水滴聲 (快速頻率偏移)
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(1200, time);
        osc.frequency.exponentialRampToValueAtTime(1800, time + 0.05);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.3, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(time);
        osc.stop(time + 0.1);
      } else {
        // 沉重的落水聲
        playTone({ freq: 150, type: 'sine', decay: 0.8, filterType: 'lowpass', time, vol: 0.6 });
      }
      break;
  }

  const delay = (time - audioCtx.currentTime) * 1000;
  setTimeout(() => {
    if (!isRunning) return;
    totalSwings++;
    updateUI(countIndex);
  }, Math.max(0, delay));
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
  
  // 恢復音效模式按鈕狀態
  document.querySelectorAll('.sound-btn').forEach(btn => {
    if (btn.dataset.mode === soundMode) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  
  updateTimerDisplay();
}

init();
