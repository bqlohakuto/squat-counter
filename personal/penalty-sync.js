(() => {
  'use strict';

  const CONFIG_KEY = 'talkCoachPenaltyFirebaseConfig';
  const ROOM_KEY = 'talkCoachPenaltyRoom';
  const APP_NAME = 'talk-coach-penalty';
  const DEFAULT_STATE = Object.freeze({ target: 0, completed: 0, status: 'idle', updatedAt: 0 });

  let remoteRef = null;
  let current = { ...DEFAULT_STATE };
  let initPromise = null;
  const listeners = new Set();
  const statusListeners = new Set();

  function normalizeState(value) {
    const target = Math.max(0, Number.parseInt(value?.target, 10) || 0);
    const completed = Math.min(target, Math.max(0, Number.parseInt(value?.completed, 10) || 0));
    return {
      target,
      completed,
      status: target > 0 && completed < target ? 'active' : target > 0 ? 'complete' : 'idle',
      updatedAt: Number(value?.updatedAt) || 0
    };
  }

  function publicState(value = current) {
    const state = normalizeState(value);
    return { ...state, remaining: Math.max(0, state.target - state.completed) };
  }

  function emit(next) {
    current = normalizeState(next);
    const detail = publicState();
    listeners.forEach(listener => {
      try { listener(detail); } catch (_) {}
    });
    window.dispatchEvent(new CustomEvent('penaltysync:change', { detail }));
  }

  function emitStatus(status, message = '') {
    const detail = { status, message };
    statusListeners.forEach(listener => {
      try { listener(detail); } catch (_) {}
    });
    window.dispatchEvent(new CustomEvent('penaltysync:status', { detail }));
  }

  function getConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function getRoom() {
    return (localStorage.getItem(ROOM_KEY) || '').trim();
  }

  function isConfigured() {
    const config = getConfig();
    return Boolean(config?.apiKey && config?.projectId && config?.databaseURL && getRoom());
  }

  function generateRoom() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').match(/.{1,4}/g).join('-');
  }

  function sanitizeRoom(room) {
    return String(room || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  }

  function setSetup(config, room) {
    const safeRoom = sanitizeRoom(room) || generateRoom();
    if (!config || typeof config !== 'object') throw new Error('Firebase設定が正しくありません。');
    if (!config.apiKey || !config.projectId || !config.databaseURL) throw new Error('apiKey / projectId / databaseURL が必要です。');
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(ROOM_KEY, safeRoom);
    return { config, room: safeRoom };
  }

  function clearSetup() {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(ROOM_KEY);
  }

  function exportSetup() {
    const config = getConfig();
    const room = getRoom();
    if (!config || !room) return '';
    return JSON.stringify({ version: 1, config, room });
  }

  function importSetup(text) {
    const payload = JSON.parse(String(text || '').trim());
    return setSetup(payload.config, payload.room);
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!isConfigured()) {
        emitStatus('unconfigured', 'Firebase連携が未設定です。');
        emit(DEFAULT_STATE);
        return false;
      }

      if (!window.firebase?.initializeApp) {
        emitStatus('error', 'Firebase SDKを読み込めませんでした。');
        return false;
      }

      emitStatus('connecting', 'Firebaseへ接続しています。');

      try {
        let app;
        try {
          app = window.firebase.app(APP_NAME);
        } catch (_) {
          app = window.firebase.initializeApp(getConfig(), APP_NAME);
        }

        const auth = app.auth();
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
        if (!auth.currentUser) await auth.signInAnonymously();

        remoteRef = app.database().ref('penaltySessions/' + getRoom());
        remoteRef.on('value', snapshot => emit(snapshot.val() || DEFAULT_STATE), error => {
          console.error('[Penalty Sync]', error);
          emitStatus('error', error.message || '同期に失敗しました。');
        });

        emitStatus('connected', 'SQUAT BARと同期中');
        return true;
      } catch (error) {
        console.error('[Penalty Sync]', error);
        emitStatus('error', error.message || 'Firebaseへ接続できませんでした。');
        return false;
      }
    })();

    return initPromise;
  }

  async function transact(mutator) {
    const ready = await init();
    if (!ready || !remoteRef) throw new Error('Firebase連携が未設定または未接続です。');

    const result = await remoteRef.transaction(raw => {
      const state = normalizeState(raw || DEFAULT_STATE);
      const next = mutator(state);
      if (!next) return;
      const target = Math.max(0, Number.parseInt(next.target, 10) || 0);
      const completed = Math.min(target, Math.max(0, Number.parseInt(next.completed, 10) || 0));
      return {
        target,
        completed,
        status: target > 0 && completed < target ? 'active' : target > 0 ? 'complete' : 'idle',
        updatedAt: Date.now()
      };
    });

    const value = normalizeState(result.snapshot.val() || DEFAULT_STATE);
    emit(value);
    return { ...publicState(value), committed: result.committed };
  }

  async function addPenalty(amount = 10) {
    const add = Math.max(1, Number.parseInt(amount, 10) || 10);
    return transact(state => ({
      ...state,
      target: state.target + add
    }));
  }

  async function completeOne() {
    return transact(state => {
      if (state.target <= 0 || state.completed >= state.target) return null;
      return {
        ...state,
        completed: state.completed + 1
      };
    });
  }

  async function reset() {
    return transact(() => ({ ...DEFAULT_STATE }));
  }

  function onChange(listener) {
    listeners.add(listener);
    listener(publicState());
    return () => listeners.delete(listener);
  }

  function onStatus(listener) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  }

  function getState() {
    return publicState();
  }

  window.PenaltySync = {
    init,
    isConfigured,
    getConfig,
    getRoom,
    setSetup,
    clearSetup,
    exportSetup,
    importSetup,
    generateRoom,
    addPenalty,
    completeOne,
    reset,
    onChange,
    onStatus,
    getState
  };

  init();
})();