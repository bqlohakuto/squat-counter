const STORAGE_KEY = "squat-maid-data-v1";
const SQUAT_MET = 5;
const MAIDS = [
  { id: "luna", name: "ルナ", role: "カウンター担当", threshold: 0, image: "a_clean_cutout_transparent_background_illustration.png" },
  { id: "mirei", name: "ミレイ", role: "もうひとりのスタッフ", threshold: 1000, image: "staff-2.png" },
  { id: "manager", name: "店長", role: "SQUAT BAR 店長", image: "staff-manager.png", unlock: "high-streak" }
];
const REWARDS = [
  { name: "お祝いのリボン", role: "累計100回で解放", icon: "🎀", threshold: 100 },
  { name: "ごほうびティータイム", role: "累計300回で解放", icon: "☕", threshold: 300 },
  { name: "中庭の背景", role: "累計1,000回で解放", icon: "🌳", threshold: 1000 }
];
let data = loadData();
let inputCount = 10;
let editingRecordId = null;
let motionState = null;
let motionOriginRecord = null;
let motionTimer = null;
let pendingMotionResult = null;

function loadData() { try { return { goal: 30, maidName: "ルナ", selectedStaffId: "luna", weightKg: 60, records: [], ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; } catch { return { goal: 30, maidName: "ルナ", selectedStaffId: "luna", weightKg: 60, records: [] }; } }
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function dayKey(value) { const d = new Date(value); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function todayKey() { return dayKey(Date.now()); }
function total() { return data.records.reduce((sum, record) => sum + record.count, 0); }
function todayTotal() { return data.records.filter(record => dayKey(record.createdAt) === todayKey()).reduce((sum, record) => sum + record.count, 0); }
function activeEnergy(seconds, weightKg = data.weightKg) { return Math.max(0, (SQUAT_MET - 1) * 3.5 * weightKg / 200 * (seconds / 60)); }
function formatEnergy(value) { return `${Number(value || 0).toFixed(1)} kcal`; }
function formatDuration(seconds) { const safe = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; }
function highAchievementStreak() {
  const dailyTotals = new Map();
  data.records.forEach(record => dailyTotals.set(dayKey(record.createdAt), (dailyTotals.get(dayKey(record.createdAt)) ?? 0) + record.count));
  let date = new Date(); date.setHours(0, 0, 0, 0);
  if ((dailyTotals.get(dayKey(date)) ?? 0) < 100) date.setDate(date.getDate() - 1);
  let count = 0; while ((dailyTotals.get(dayKey(date)) ?? 0) >= 100) { count += 1; date.setDate(date.getDate() - 1); }
  return count;
}
function isStaffUnlocked(staff, all = total()) { return staff.unlock === "high-streak" ? highAchievementStreak() >= 7 : all >= staff.threshold; }
function staffUnlockLabel(staff) { return staff.unlock === "high-streak" ? `1日100回以上を7日連続で達成（現在 ${Math.min(highAchievementStreak(), 7)} / 7日）` : `累計${staff.threshold}回で解放`; }
function staffName(staff) { return staff.id === "luna" ? data.maidName : staff.name; }
function selectedStaff() { return MAIDS.find(staff => staff.id === data.selectedStaffId) ?? MAIDS[0]; }
function streak() {
  const days = new Set(data.records.map(record => dayKey(record.createdAt)));
  let date = new Date(); date.setHours(0,0,0,0);
  if (!days.has(dayKey(date))) date.setDate(date.getDate() - 1);
  let count = 0; while (days.has(dayKey(date))) { count++; date.setDate(date.getDate() - 1); }
  return count;
}
function render() {
  const current = todayTotal(), all = total(), achieved = current >= data.goal;
  const staff = selectedStaff();
  if (!isStaffUnlocked(staff, all)) data.selectedStaffId = "luna";
  const activeStaff = selectedStaff();
  document.querySelector("#today-count").textContent = `${current} / ${data.goal} 回`;
  document.querySelector("#total-count").textContent = all;
  document.querySelector("#streak-count").textContent = streak();
  document.querySelector("#progress-bar").style.width = `${Math.min(100, current / data.goal * 100)}%`;
  document.querySelector("#mission-text").textContent = `スクワットを${data.goal}回行う（${Math.min(current, data.goal)} / ${data.goal}）`;
  document.querySelector("#encouragement").textContent = achieved ? "目標クリア。いい夜にしよう。" : current ? `いいペース。あと${data.goal - current}回で今日の目標だよ。` : "おつかれさま。今日はどれくらいやる？";
  document.querySelector("#achievement-badge").hidden = !achieved;
  document.querySelector("#collection-total").textContent = all;
  document.querySelector("#goal-input").value = data.goal;
  document.querySelector("#weight-input").value = data.weightKg;
  document.querySelector("#home-staff-image").src = activeStaff.image;
  document.querySelector("#home-staff-image").alt = `${staffName(activeStaff)}がバーカウンターに立つ`;
  document.querySelector("#maid-name").textContent = `スタッフ：${staffName(activeStaff)}`;
  document.querySelector("#maid-name-input").value = data.maidName;
  document.querySelector("#staff-dialog-image").src = activeStaff.image;
  document.querySelector("#staff-dialog-image").alt = `${staffName(activeStaff)}の全身イラスト`;
  renderHistory(); renderCollection(all);
}
function renderHistory() {
  const list = document.querySelector("#history-list"), empty = document.querySelector("#history-empty");
  const best = data.records.reduce((bestRecord, record) => !bestRecord || record.count > bestRecord.count ? record : bestRecord, null);
  const energyTotal = data.records.reduce((sum, record) => sum + Number(record.activeEnergy || 0), 0);
  document.querySelector("#history-best-count").textContent = `${best?.count ?? 0}回`;
  document.querySelector("#history-best-energy").textContent = formatEnergy(best?.activeEnergy);
  document.querySelector("#history-total-count").textContent = `${total()}回`;
  document.querySelector("#history-total-energy").textContent = formatEnergy(energyTotal);
  list.innerHTML = ""; empty.hidden = data.records.length > 0;
  [...data.records].sort((a,b) => b.createdAt - a.createdAt).forEach(record => {
    const d = new Date(record.createdAt); const item = document.createElement("article"); item.className = "history-item";
    const metrics = record.durationSeconds ? ` · ${formatDuration(record.durationSeconds)} · ${formatEnergy(record.activeEnergy)}` : "";
    item.innerHTML = `<div class="history-icon">🏋️</div><div class="history-copy"><strong>${record.count} 回</strong><span>${d.toLocaleString("ja-JP", {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}${metrics}${record.memo ? ` · ${escapeHtml(record.memo)}` : ""}</span></div><div class="history-actions"><button class="edit-button" aria-label="記録を編集">編集</button><button class="delete-button" aria-label="記録を削除">削除</button></div>`;
    item.querySelector(".edit-button").onclick = () => openRecordDialog(record);
    item.querySelector(".delete-button").onclick = () => { data.records = data.records.filter(item => item.id !== record.id); saveData(); render(); };
    list.append(item);
  });
}
function renderCollection(all) {
  const list = document.querySelector("#staff-list"); list.innerHTML = "";
  MAIDS.forEach(staff => {
    const unlocked = isStaffUnlocked(staff, all), selected = staff.id === data.selectedStaffId;
    const card = document.createElement("button"); card.type = "button"; card.className = `staff-select-card ${selected ? "selected" : ""} ${unlocked ? "" : "locked"}`;
    card.disabled = !unlocked;
    card.innerHTML = unlocked ? `<img src="${staff.image}" alt="${staffName(staff)}" /><span><strong>${staffName(staff)}</strong><small>${staff.role}</small></span><b>${selected ? "選択中" : "選択"}</b>` : `<span class="staff-lock-avatar">🔒</span><span><strong>？？？</strong><small>${staffUnlockLabel(staff)}</small></span><b>🔒</b>`;
    if (unlocked) card.onclick = () => { data.selectedStaffId = staff.id; saveData(); render(); };
    list.append(card);
  });
  renderUnlocks("#reward-list", REWARDS, all);
}
function renderUnlocks(selector, items, all, usesMaidName = false) {
  const root = document.querySelector(selector); root.innerHTML = "";
  items.forEach((item, index) => { const unlocked = all >= item.threshold; const name = usesMaidName && index === 0 ? data.maidName : item.name; const row = document.createElement("article"); row.className = `unlock-row ${unlocked ? "" : "locked"}`; row.innerHTML = `<div class="unlock-icon">${unlocked ? item.icon : "🔒"}</div><div class="unlock-copy"><strong>${unlocked ? escapeHtml(name) : "？？？"}</strong><span>${unlocked ? item.role : `累計${item.threshold}回で解放`}</span></div><span class="${unlocked ? "unlock-status" : "lock-status"}">${unlocked ? "✓" : "🔒"}</span>`; root.append(row); });
}
function escapeHtml(text) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }
function showPage(page) {
  const titles = { home: "", history: "記録の履歴", collection: "お店のコレクション", settings: "設定" };
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active")); document.querySelector(`#${page}-page`).classList.add("active");
  document.querySelector("#page-title").textContent = titles[page];
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.page === page));
}
function toast(message) { const element = document.querySelector("#toast"); element.textContent = message; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 2600); }

document.querySelectorAll(".tab").forEach(tab => tab.onclick = () => showPage(tab.dataset.page));
function localDateTimeValue(timestamp) { const date = new Date(timestamp); const offset = date.getTimezoneOffset() * 60_000; return new Date(date - offset).toISOString().slice(0, 16); }
function openRecordDialog(record = null, presetCount = null, motionResult = null) {
  stopMotionCounter();
  motionState = null;
  pendingMotionResult = motionResult;
  editingRecordId = record?.id ?? null;
  setInputCount(presetCount ?? record?.count ?? 10);
  document.querySelector("#memo-input").value = record?.memo ?? "";
  document.querySelector("#performed-at-input").value = localDateTimeValue(record?.createdAt ?? Date.now());
  document.querySelector("#record-dialog-title").textContent = record ? "記録を編集" : "記録する";
  document.querySelector("#record-save-button").textContent = record ? "変更を保存" : "保存する";
  document.querySelector("#record-dialog").showModal();
}
document.querySelector("#add-record-button").onclick = () => openRecordDialog();
document.querySelector("#share-button").onclick = () => { const message = `今日はスクワットを${todayTotal()}回やった。\n#SQUATBAR #スクワット`; window.open(`https://x.com/intent/post?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); };
function normalizedCount(value) { return Math.min(500, Math.max(1, Number.parseInt(value, 10) || 1)); }
function setInputCount(value) { inputCount = normalizedCount(value); document.querySelector("#count-input").value = inputCount; }
document.querySelector("#count-minus").onclick = () => setInputCount(inputCount - 5);
document.querySelector("#count-plus").onclick = () => setInputCount(inputCount + 5);
document.querySelector("#count-input").addEventListener("change", event => setInputCount(event.target.value));
function setMotionStatus(message) { document.querySelector("#motion-status").textContent = message; }
function updateMotionUi() {
  const state = motionState ?? { count: 0, phase: "idle", active: false };
  const labels = { idle: ["Ⅰ", "開始前"], calibrating: ["Ⅰ", "直立姿勢を確認中"], ready: ["Ⅱ", "しゃがんでください"], down: ["Ⅲ", "しゃがみ姿勢 OK"], done: ["✓", "計測を終了しました"] };
  const [mark, label] = labels[state.phase] ?? labels.idle;
  document.querySelector("#motion-count").textContent = state.count;
  const elapsed = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : state.durationSeconds ?? 0;
  document.querySelector("#motion-duration").textContent = formatDuration(elapsed);
  document.querySelector("#motion-energy").innerHTML = `${activeEnergy(elapsed).toFixed(1)} <small>kcal</small>`;
  document.querySelector("#motion-posture").dataset.phase = state.phase;
  document.querySelector("#motion-posture-mark").textContent = mark;
  document.querySelector("#motion-posture-label").textContent = label;
  document.querySelector("#motion-begin-button").hidden = state.active;
  document.querySelector("#motion-finish-button").hidden = !state.active;
}
function haptic(pattern) { if (typeof navigator.vibrate === "function") navigator.vibrate(pattern); }
function isUpright(beta) { return Math.abs(Math.abs(beta) - 90) <= 28; }
function isHorizontal(beta) { return Math.abs(beta) <= 25; }
function handleDeviceOrientation(event) {
  if (!motionState?.active || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  if (motionState.phase === "calibrating") {
    if (!isUpright(event.beta)) { motionState.samples = []; setMotionStatus("スマホ上部を下にして、太ももをまっすぐにしてください。"); return; }
    motionState.samples.push(event.beta);
    if (motionState.samples.length < 12) return;
    motionState.phase = "ready"; setMotionStatus("準備完了。ゆっくりしゃがみ、スマホが水平になるまで下げてください。"); updateMotionUi();
    return;
  }
  if (motionState.phase === "ready" && isHorizontal(event.beta)) {
    motionState.phase = "down"; haptic(80); setMotionStatus("しゃがみ姿勢を検出しました。立ち上がって直立姿勢へ戻ってください。"); updateMotionUi(); return;
  }
  if (motionState.phase === "down" && isUpright(event.beta) && Date.now() - motionState.lastCountAt >= 650) {
    motionState.phase = "ready"; motionState.lastCountAt = Date.now(); motionState.count += 1;
    inputCount = motionState.count; document.querySelector("#count-input").value = inputCount;
    haptic([45, 60, 45]); updateMotionUi(); setMotionStatus(`${motionState.count}回。もう一度しゃがんでください。`);
  }
}
function stopMotionCounter() {
  if (motionState?.active) window.removeEventListener("deviceorientation", handleDeviceOrientation);
  if (motionTimer) { window.clearInterval(motionTimer); motionTimer = null; }
  if (motionState) motionState.active = false;
}
function openMotionCounter() {
  motionOriginRecord = editingRecordId ? data.records.find(record => record.id === editingRecordId) : null;
  document.querySelector("#record-dialog").close();
  motionState = { active: false, phase: "idle", samples: [], count: 0, lastCountAt: 0, durationSeconds: 0 };
  updateMotionUi(); setMotionStatus("スマホの背面を太ももへ。上部を下にして、直立した姿勢で準備してください。");
  document.querySelector("#motion-dialog").showModal();
}
async function startMotionCounter() {
  if (!("DeviceOrientationEvent" in window)) return setMotionStatus("この端末では傾きセンサーを利用できません。手入力をご利用ください。");
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") return setMotionStatus("センサーの利用が許可されませんでした。Safariの設定をご確認ください。");
    }
    motionState = { active: true, phase: "calibrating", samples: [], count: 0, lastCountAt: 0, startedAt: Date.now() };
    updateMotionUi(); setMotionStatus("直立姿勢を確認しています。太ももを動かさずにお待ちください…");
    window.addEventListener("deviceorientation", handleDeviceOrientation);
    motionTimer = window.setInterval(updateMotionUi, 500);
  } catch { setMotionStatus("センサーを開始できませんでした。HTTPSのSafariからお試しください。"); }
}
function finishMotionCounter() {
  const count = motionState?.count ?? 0;
  const durationSeconds = Math.max(1, Math.floor((Date.now() - (motionState?.startedAt ?? Date.now())) / 1000));
  const result = { durationSeconds, activeEnergy: activeEnergy(durationSeconds) };
  stopMotionCounter(); document.querySelector("#motion-dialog").close();
  if (count) openRecordDialog(motionOriginRecord, count, result);
}
document.querySelector("#motion-open-button").onclick = openMotionCounter;
document.querySelector("#motion-begin-button").onclick = startMotionCounter;
document.querySelector("#motion-finish-button").onclick = finishMotionCounter;
document.querySelector("#motion-close-button").onclick = () => document.querySelector("#motion-dialog").close();
document.querySelector("#motion-dialog").addEventListener("close", stopMotionCounter);
document.querySelector("#record-form").addEventListener("submit", event => { event.preventDefault(); setInputCount(document.querySelector("#count-input").value); const before = todayTotal(); const createdAt = new Date(document.querySelector("#performed-at-input").value).getTime() || Date.now(); const memo = document.querySelector("#memo-input").value.trim(); const existing = data.records.find(record => record.id === editingRecordId); if (existing) { existing.count = inputCount; existing.memo = memo; existing.createdAt = createdAt; if (pendingMotionResult) Object.assign(existing, pendingMotionResult); } else { data.records.push({ id: crypto.randomUUID(), count: inputCount, memo, createdAt, ...(pendingMotionResult ?? {}) }); } saveData(); document.querySelector("#record-dialog").close(); document.querySelector("#memo-input").value = ""; const wasEditing = editingRecordId !== null; editingRecordId = null; pendingMotionResult = null; render(); const activeName = staffName(selectedStaff()); if (!wasEditing) toast(before < data.goal && todayTotal() >= data.goal ? `✦ 目標クリア。${activeName}から一杯どうぞ。` : `${activeName}「${inputCount}回、いいね。」`); });
document.querySelector("#goal-minus").onclick = () => { data.goal = Math.max(5, data.goal - 5); saveData(); render(); };
document.querySelector("#goal-plus").onclick = () => { data.goal = Math.min(500, data.goal + 5); saveData(); render(); };
document.querySelector("#goal-input").addEventListener("change", event => { data.goal = Math.min(500, Math.max(5, Number.parseInt(event.target.value, 10) || 5)); saveData(); render(); });
document.querySelector("#weight-input").addEventListener("change", event => { data.weightKg = Math.min(300, Math.max(20, Number.parseFloat(event.target.value) || 20)); saveData(); render(); });
document.querySelector("#maid-name-input").addEventListener("change", event => { data.maidName = event.target.value.trim().slice(0, 20) || "ルナ"; saveData(); render(); });
document.querySelector("#add-reminder-button").onclick = async () => { const reminder = { title: "SQUAT BAR", text: "スクワットを記録する", url: location.href }; if (!navigator.share) return toast("iPhoneのSafariから開くとリマインダーへ追加できます。"); try { await navigator.share(reminder); } catch (error) { if (error.name !== "AbortError") toast("共有メニューを開けませんでした。"); } };
document.querySelector("#show-fullbody-button").onclick = () => document.querySelector("#staff-dialog").showModal();
document.querySelector("#close-staff-dialog").onclick = () => document.querySelector("#staff-dialog").close();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
render();
