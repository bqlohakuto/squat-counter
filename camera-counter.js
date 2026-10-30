(() => {
  const TASKS_VERSION = "1.2.0";
  const TASKS_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
  const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
  const MODEL_URL = new URL("face_landmarker.task", new URL("./", document.currentScript?.src || location.href)).href;
  let faceLandmarker = null, taskApi = null, animationFrame = null;
  let state = { running: false, count: 0, phase: "idle", samples: [], startedAt: 0, baseline: 0, movement: 0, lastCountAt: 0, stream: null, onFinish: null };
  const el = id => document.querySelector(`#${id}`);
  const now = () => performance.now();

  async function ensureLandmarker() {
    if (faceLandmarker) return faceLandmarker;
    const { FaceLandmarker, FilesetResolver } = await import(TASKS_BUNDLE_URL);
    taskApi = await FilesetResolver.forVisionTasks(WASM_ROOT);
    const options = delegate => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numFaces: 1,
      minFaceDetectionConfidence: 0.55, minFacePresenceConfidence: 0.55, minTrackingConfidence: 0.55
    });
    try { faceLandmarker = await FaceLandmarker.createFromOptions(taskApi, options("GPU")); }
    catch (gpuError) { console.warn("GPU face detection unavailable; retrying on CPU.", gpuError); faceLandmarker = await FaceLandmarker.createFromOptions(taskApi, options("CPU")); }
    return faceLandmarker;
  }
  async function requestCamera() {
    const preferred = { video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false };
    try { return await navigator.mediaDevices.getUserMedia(preferred); }
    catch (error) {
      if (error?.name === "NotAllowedError") throw error;
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  }
  function cameraErrorMessage(error, modelError = false) {
    if (modelError) return "頭の検出の準備に失敗しました。通信を確認して、もう一度お試しください。";
    if (error?.name === "NotAllowedError") return "カメラの使用を許可してください。iPhoneの設定からSafari（またはSQUAT BAR）のカメラを許可します。";
    if (error?.name === "NotFoundError") return "利用できるカメラが見つかりません。";
    if (error?.name === "NotReadableError") return "カメラをほかのアプリが使用中です。カメラアプリなどを閉じてください。";
    return "カメラを開始できませんでした。アプリを閉じて開き直し、もう一度お試しください。";
  }
  function updateFeedback() {
    const movement = Math.max(0, state.movement || 0);
    const progress = state.baseline ? Math.min(100, Math.round((movement / 0.065) * 100)) : 0;
    const stage = el("camera-staff-image")?.parentElement;
    const movingDown = state.phase === "upright";
    stage?.classList.toggle("is-step1", movingDown && movement >= 0.018 && movement < 0.043);
    stage?.classList.toggle("is-step2", movingDown && movement >= 0.043);
    stage?.classList.toggle("is-squatting", state.phase === "down");
    const feedbackCount = el("camera-feedback-count"), feedbackState = el("camera-feedback-state"), feedback = el("camera-feedback"), depthFill = el("camera-depth-fill");
    if (feedbackCount) feedbackCount.textContent = `${state.count}回`;
    if (depthFill) depthFill.style.width = `${progress}%`;
    const labels = {
      idle: "カメラを開始してください", calibrating: "直立姿勢を確認中…", down: "しゃがみを検出。立ち上がってください", lost: "頭をガイド内へ戻してください"
    };
    const liveLabel = state.phase === "upright" ? (progress >= 66 ? "もう少しでしゃがみ判定" : progress >= 28 ? "下げています" : "立ち姿勢を確認") : labels[state.phase] ?? labels.idle;
    if (feedbackState) feedbackState.textContent = liveLabel;
    if (feedback) feedback.dataset.phase = state.phase;
  }
  function updateUi(message = "") {
    el("camera-count").textContent = state.count;
    const labels = { idle: "準備中", calibrating: "基準を確認中", upright: "立ち姿勢", down: "しゃがみ姿勢 OK", lost: "頭を映してください" };
    el("camera-phase").textContent = labels[state.phase] ?? labels.idle;
    if (message) el("camera-status").textContent = message;
    el("camera-guide").dataset.phase = state.phase;
    el("camera-finish-button").hidden = !state.running;
    el("camera-start-button").hidden = state.running;
    updateFeedback();
  }
  function stopCamera() {
    if (animationFrame) cancelAnimationFrame(animationFrame); animationFrame = null;
    state.running = false;
    state.stream?.getTracks().forEach(track => track.stop()); state.stream = null;
    const video = el("camera-video"); if (video) video.srcObject = null;
    const stage = el("camera-staff-image")?.parentElement;
    stage?.classList.remove("is-step1", "is-step2", "is-squatting");
  }
  function processHeadPosition(y, timestamp) {
    if (state.phase === "calibrating") {
      state.samples.push(y);
      if (timestamp - state.startedAt > 1100 && state.samples.length > 10) {
        state.baseline = state.samples.reduce((sum, value) => sum + value, 0) / state.samples.length;
        state.movement = 0; state.phase = "upright"; updateUi("立ち姿勢を基準にしました。ゆっくりしゃがんでください。");
      }
      return;
    }
    const movement = y - state.baseline;
    state.movement = movement;
    el("camera-guide").style.setProperty("--head-y", `${Math.max(0, Math.min(1, y)) * 100}%`);
    updateFeedback();
    if (state.phase === "upright" && movement > 0.065) { state.phase = "down"; updateUi("しゃがみ姿勢を確認。立ち上がると1回です。"); }
    else if (state.phase === "down" && movement < 0.025 && timestamp - state.lastCountAt > 700) {
      state.count += 1; state.lastCountAt = timestamp; state.phase = "upright"; state.movement = 0; updateUi(`${state.count}回カウント。次もフォームを整えて。`);
    }
  }
  function detectFrame(timestamp) {
    if (!state.running) return;
    const video = el("camera-video");
    try {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && faceLandmarker) {
        const result = faceLandmarker.detectForVideo(video);
        const head = result.faceLandmarks?.[0]?.[10];
        if (head) processHeadPosition(head.y, timestamp);
        else if (state.phase !== "calibrating") { state.phase = "lost"; state.movement = 0; updateUi("頭と肩がカメラに入る位置へ戻ってください。"); }
      }
    } catch (error) { updateUi("頭の検出を続けられません。カメラを開始し直してください。"); }
    animationFrame = requestAnimationFrame(detectFrame);
  }
  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { updateUi("このブラウザではカメラを利用できません。HTTPSのSafariで開いてください。"); return; }
    updateUi("カメラを起動しています…");
    let stream;
    try { stream = await requestCamera(); }
    catch (error) { console.error("Camera permission/start failed.", error); stopCamera(); updateUi(cameraErrorMessage(error)); return; }
    const video = el("camera-video");
    try { video.srcObject = stream; await video.play(); }
    catch (error) { stream.getTracks().forEach(track => track.stop()); stopCamera(); updateUi(cameraErrorMessage(error)); return; }
    try { updateUi("頭の検出を準備しています…"); await ensureLandmarker(); }
    catch (error) { console.error("Face detection model failed.", error); stream.getTracks().forEach(track => track.stop()); stopCamera(); updateUi(cameraErrorMessage(error, true)); return; }
    state = { ...state, running: true, count: 0, phase: "calibrating", samples: [], startedAt: now(), baseline: 0, movement: 0, lastCountAt: 0, stream };
    updateUi("スマホを机に固定し、まっすぐ立って頭をガイド内で止めてください。"); animationFrame = requestAnimationFrame(detectFrame);
  }
  function finish() {
    const result = { count: state.count, durationSeconds: Math.max(1, Math.floor((now() - state.startedAt) / 1000)) };
    const callback = state.onFinish; stopCamera(); el("camera-dialog").close();
    if (result.count > 0) callback?.(result);
  }
  function open({ staff, onFinish }) {
    stopCamera(); state = { running: false, count: 0, phase: "idle", samples: [], startedAt: 0, baseline: 0, movement: 0, lastCountAt: 0, stream: null, onFinish };
    const setImage = (id, source) => { const image = el(id); if (image) image.src = source; };
    const mainImage = el("camera-staff-image");
    if (mainImage) { mainImage.src = staff.image; mainImage.alt = `${staff.name}が一緒にスクワットしています`; }
    setImage("camera-staff-step1-image", staff.squatStep1Image || staff.image);
    setImage("camera-staff-step2-image", staff.squatStep2Image || staff.squatImage || staff.image);
    setImage("camera-staff-squat-image", staff.squatImage || staff.image);
    const dialog = el("camera-dialog");
    if (!dialog) throw new Error("camera dialog is unavailable");
    if (!dialog.open) dialog.showModal();
    updateUi("スマホを机に置き、頭と肩をガイド内へ入れてください。");
  }
  function init() {
    el("camera-start-button").onclick = start;
    el("camera-finish-button").onclick = finish;
    el("camera-close-button").onclick = () => el("camera-dialog").close();
    el("camera-dialog").addEventListener("close", stopCamera);
  }
  window.CameraCounter = { open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();