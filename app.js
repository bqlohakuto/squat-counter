const STORAGE_KEY = "squat-maid-data-v1";
const MAIDS = [
  { name: "ルナ", role: "カウンター担当", icon: "🍸", threshold: 0 },
  { name: "ココ", role: "にぎやかなホールスタッフ", icon: "🍒", threshold: 500 },
  { name: "ユイ", role: "記録を見守るスタッフ", icon: "🥃", threshold: 1500 }
];
const REWARDS = [
  { name: "お祝いのリボン", role: "累計100回で解放", icon: "🎀", threshold: 100 },
  { name: "ごほうびティータイム", role: "累計300回で解放", icon: "☕", threshold: 300 },
  { name: "中庭の背景", role: "累計1,000回で解放", icon: "🌳", threshold: 1000 }
];
let data = loadData();
let inputCount = 10;
let editingRecordId = null;

function loadData() { try { return { goal: 30, maidName: "ルナ", remindersEnabled: false, reminderTime: "20:00", lastReminderDay: "", records: [], ...JSON.parse(localStorage.getItem(STORAGE_KEY)) }; } catch { return { goal: 30, maidName: "ルナ", remindersEnabled: false, reminderTime: "20:00", lastReminderDay: "", records: [] }; } }
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function dayKey(value) { const d = new Date(value); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function todayKey() { return dayKey(Date.now()); }
function total() { return data.records.reduce((sum, record) => sum + record.count, 0); }
function todayTotal() { return data.records.filter(record => dayKey(record.createdAt) === todayKey()).reduce((sum, record) => sum + record.count, 0); }
function streak() {
  const days = new Set(data.records.map(record => dayKey(record.createdAt)));
  let date = new Date(); date.setHours(0,0,0,0);
  if (!days.has(dayKey(date))) date.setDate(date.getDate() - 1);
  let count = 0; while (days.has(dayKey(date))) { count++; date.setDate(date.getDate() - 1); }
  return count;
}
function render() {
  const current = todayTotal(), all = total(), achieved = current >= data.goal;
  document.querySelector("#today-count").textContent = `${current} / ${data.goal} 回`;
  document.querySelector("#total-count").textContent = all;
  document.querySelector("#streak-count").textContent = streak();
  document.querySelector("#progress-bar").style.width = `${Math.min(100, current / data.goal * 100)}%`;
  document.querySelector("#mission-text").textContent = `スクワットを${data.goal}回行う（${Math.min(current, data.goal)} / ${data.goal}）`;
  const reminderDue = data.remindersEnabled && current === 0 && new Date().toTimeString().slice(0, 5) >= data.reminderTime;
  document.querySelector("#encouragement").textContent = reminderDue ? "今日の一杯、まだ残ってるよ。少しだけ動いていこう。" : achieved ? "目標クリア。いい夜にしよう。" : current ? `いいペース。あと${data.goal - current}回で今日の目標だよ。` : "おつかれさま。今日はどれくらいやる？";
  document.querySelector("#achievement-badge").hidden = !achieved;
  document.querySelector("#collection-total").textContent = all;
  document.querySelector("#goal-input").value = data.goal;
  document.querySelector("#maid-name").textContent = `スタッフ：${data.maidName}`;
  document.querySelector("#maid-name-input").value = data.maidName;
  document.querySelector("#reminder-enabled").checked = data.remindersEnabled;
  document.querySelector("#reminder-time").value = data.reminderTime;
  document.querySelector("#reminder-options").hidden = !data.remindersEnabled;
  renderHistory(); renderCollection(all);
}
function renderHistory() {
  const list = document.querySelector("#history-list"), empty = document.querySelector("#history-empty");
  list.innerHTML = ""; empty.hidden = data.records.length > 0;
  [...data.records].sort((a,b) => b.createdAt - a.createdAt).forEach(record => {
    const d = new Date(record.createdAt); const item = document.createElement("article"); item.className = "history-item";
    item.innerHTML = `<div class="history-icon">🏋️</div><div class="history-copy"><strong>${record.count} 回</strong><span>${d.toLocaleString("ja-JP", {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}${record.memo ? ` · ${escapeHtml(record.memo)}` : ""}</span></div><div class="history-actions"><button class="edit-button" aria-label="記録を編集">編集</button><button class="delete-button" aria-label="記録を削除">削除</button></div>`;
    item.querySelector(".edit-button").onclick = () => openRecordDialog(record);
    item.querySelector(".delete-button").onclick = () => { data.records = data.records.filter(item => item.id !== record.id); saveData(); render(); };
    list.append(item);
  });
}
function renderCollection(all) { renderUnlocks("#maid-list", MAIDS, all, true); renderUnlocks("#reward-list", REWARDS, all); }
function renderUnlocks(selector, items, all, usesMaidName = false) {
  const root = document.querySelector(selector); root.innerHTML = "";
  items.forEach((item, index) => { const unlocked = all >= item.threshold; const name = usesMaidName && index === 0 ? data.maidName : item.name; const row = document.createElement("article"); row.className = `unlock-row ${unlocked ? "" : "locked"}`; row.innerHTML = `<div class="unlock-icon">${unlocked ? item.icon : "🔒"}</div><div class="unlock-copy"><strong>${unlocked ? escapeHtml(name) : "？？？"}</strong><span>${unlocked ? item.role : `累計${item.threshold}回で解放`}</span></div><span class="${unlocked ? "unlock-status" : "lock-status"}">${unlocked ? "✓" : "🔒"}</span>`; root.append(row); });
}
function escapeHtml(text) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }
function showPage(page) {
  const titles = { home: "カウンター", history: "記録の履歴", collection: "お店のコレクション", settings: "設定" };
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active")); document.querySelector(`#${page}-page`).classList.add("active");
  document.querySelector("#page-title").textContent = titles[page];
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.page === page));
}
function toast(message) { const element = document.querySelector("#toast"); element.textContent = message; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 2600); }
function sendReminderNotification() {
  if (!data.remindersEnabled || todayTotal() > 0 || data.lastReminderDay === todayKey() || new Date().toTimeString().slice(0, 5) < data.reminderTime) return;
  data.lastReminderDay = todayKey(); saveData();
  if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) navigator.serviceWorker.ready.then(registration => registration.showNotification("SQUAT BAR", { body: "今日の一杯、まだ残ってるよ。スクワットを始めよう。", icon: "icon.svg", tag: "daily-squat-reminder" }));
}
function scheduleReminder() {
  clearTimeout(window.reminderTimer);
  if (!data.remindersEnabled || todayTotal() > 0) return;
  const [hours, minutes] = data.reminderTime.split(":").map(Number); const when = new Date(); when.setHours(hours, minutes, 0, 0); if (when <= new Date()) sendReminderNotification(); else window.reminderTimer = setTimeout(sendReminderNotification, when - new Date());
}

document.querySelectorAll(".tab").forEach(tab => tab.onclick = () => showPage(tab.dataset.page));
function localDateTimeValue(timestamp) { const date = new Date(timestamp); const offset = date.getTimezoneOffset() * 60_000; return new Date(date - offset).toISOString().slice(0, 16); }
function openRecordDialog(record = null) {
  editingRecordId = record?.id ?? null;
  setInputCount(record?.count ?? 10);
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
document.querySelector("#record-form").addEventListener("submit", event => { event.preventDefault(); setInputCount(document.querySelector("#count-input").value); const before = todayTotal(); const createdAt = new Date(document.querySelector("#performed-at-input").value).getTime() || Date.now(); const memo = document.querySelector("#memo-input").value.trim(); const existing = data.records.find(record => record.id === editingRecordId); if (existing) { existing.count = inputCount; existing.memo = memo; existing.createdAt = createdAt; } else { data.records.push({ id: crypto.randomUUID(), count: inputCount, memo, createdAt }); } saveData(); document.querySelector("#record-dialog").close(); document.querySelector("#memo-input").value = ""; const wasEditing = editingRecordId !== null; editingRecordId = null; render(); if (!wasEditing) toast(before < data.goal && todayTotal() >= data.goal ? `✦ 目標クリア。${data.maidName}から一杯どうぞ。` : `${data.maidName}「${inputCount}回、いいね。」`); });
document.querySelector("#goal-minus").onclick = () => { data.goal = Math.max(5, data.goal - 5); saveData(); render(); };
document.querySelector("#goal-plus").onclick = () => { data.goal = Math.min(500, data.goal + 5); saveData(); render(); };
document.querySelector("#goal-input").addEventListener("change", event => { data.goal = Math.min(500, Math.max(5, Number.parseInt(event.target.value, 10) || 5)); saveData(); render(); });
document.querySelector("#maid-name-input").addEventListener("change", event => { data.maidName = event.target.value.trim().slice(0, 20) || "ルナ"; saveData(); render(); });
document.querySelector("#reminder-enabled").addEventListener("change", event => { data.remindersEnabled = event.target.checked; saveData(); render(); scheduleReminder(); });
document.querySelector("#reminder-time").addEventListener("change", event => { data.reminderTime = event.target.value || "20:00"; saveData(); render(); scheduleReminder(); });
document.querySelector("#notification-permission-button").onclick = async () => { if (!("Notification" in window)) return toast("このブラウザでは通知を利用できません。"); const result = await Notification.requestPermission(); toast(result === "granted" ? "通知を許可しました。" : "通知は許可されていません。"); };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
render();
scheduleReminder();
