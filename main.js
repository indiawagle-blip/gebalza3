import './style.css';
// 제공해주신 웹앱 주소 연결
const API_URL = "https://script.google.com/macros/s/AKfycbwh7SouQXxArlKFzdzUa1NAgvdwKb7bXgeMV43OXDOEUkHzDItbWmFhdFMT0slZQN1YTQ/exec";

let currentYearMonth = "";
let targetHours = 168;
let monthData = {};
let syncDebounceTimers = {};

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
currentYearMonth = `${currentYear}-${currentMonth}`;

// DOM 엘리먼트
const monthPicker = document.getElementById("monthPicker");
const targetHoursInput = document.getElementById("targetHours");
const tableBody = document.getElementById("workTableBody");
const totalWorkedEl = document.getElementById("totalWorked");
const remainingHoursEl = document.getElementById("remainingHours");
const dailyRecommendedEl = document.getElementById("dailyRecommended");
const remainingWorkdaysText = document.getElementById("remainingWorkdaysText");
const remainingStatus = document.getElementById("remainingStatus");
const syncStatusEl = document.getElementById("syncStatus");

function init() {
  monthPicker.value = currentYearMonth;
  
  // 1. 로컬 저장소 먼저 로드
  loadLocalStorage();
  renderCalendar();
  calculateAll();

  // 2. 구글 스프레드시트에서 최신 데이터 가져오기
  fetchSheetData();

  monthPicker.addEventListener("change", (e) => {
    currentYearMonth = e.target.value;
    loadLocalStorage();
    renderCalendar();
    calculateAll();
    fetchSheetData();
  });

  targetHoursInput.addEventListener("input", (e) => {
    targetHours = parseFloat(e.target.value) || 0;
    saveLocalStorage();
    calculateAll();
  });
}

function getStorageKey() {
  return `cosmic_debt_${currentYearMonth}`;
}

function loadLocalStorage() {
  const saved = localStorage.getItem(getStorageKey());
  if (saved) {
    const parsed = JSON.parse(saved);
    monthData = parsed.monthData || {};
    targetHours = parsed.targetHours || 168;
  } else {
    monthData = {};
    targetHours = 168;
  }
  targetHoursInput.value = targetHours;
}

function saveLocalStorage() {
  localStorage.setItem(
    getStorageKey(),
    JSON.stringify({ targetHours, monthData })
  );
}

// 구글 시트에서 이번 달 데이터 조회
async function fetchSheetData() {
  syncStatusEl.textContent = "⏳ 심연과 교신 중...";
  syncStatusEl.className = "sync-badge saving";

  try {
    const res = await fetch(`${API_URL}?month=${currentYearMonth}`);
    const result = await res.json();
    if (result.status === "success") {
      if (result.data && Object.keys(result.data).length > 0) {
        monthData = { ...monthData, ...result.data };
      }
      if (result.targetHours) {
        targetHours = result.targetHours;
        targetHoursInput.value = targetHours;
      }
      saveLocalStorage();
      renderCalendar();
      calculateAll();

      syncStatusEl.textContent = "🌌 시트 동기화 완료";
      syncStatusEl.className = "sync-badge saved";
    }
  } catch (err) {
    console.error(err);
    syncStatusEl.textContent = "⚠️ 오프라인 모드";
    syncStatusEl.className = "sync-badge";
  }
}

// 구글 시트로 특정 일자 데이터 자동 전송 (디바운스 0.6초, Content-Type: text/plain)
function syncDayToSheet(dateStr) {
  syncStatusEl.textContent = "✍️ 각인 중...";
  syncStatusEl.className = "sync-badge saving";

  if (syncDebounceTimers[dateStr]) {
    clearTimeout(syncDebounceTimers[dateStr]);
  }

  syncDebounceTimers[dateStr] = setTimeout(async () => {
    const record = monthData[dateStr] || {};
    const payload = {
      date: dateStr,
      type: record.type || "정상",
      start: record.start || "",
      end: record.end || "",
      breakMin: record.breakMin !== undefined ? record.breakMin : 60,
      totalHours: record.totalHours || 0,
      yearMonth: currentYearMonth,
      targetHours: targetHours
    };

    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      syncStatusEl.textContent = "🌌 각인 완료";
      syncStatusEl.className = "sync-badge saved";
    } catch (err) {
      console.error(err);
      syncStatusEl.textContent = "⚠️ 각인 실패 (로컬 보관)";
      syncStatusEl.className = "sync-badge";
    }
  }, 600);
}

function renderCalendar() {
  tableBody.innerHTML = "";
  const [year, month] = currentYearMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, "0")}`;

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${currentYearMonth}-${String(day).padStart(2, "0")}`;
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeekNum = dateObj.getDay();
    const dayOfWeekNames = ["일", "월", "화", "수", "목", "금", "토"];
    const dayName = dayOfWeekNames[dayOfWeekNum];
    const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
    const isToday = dateStr === todayStr;

    const record = monthData[dateStr] || {
      type: isWeekend ? "휴일" : "정상",
      start: "",
      end: "",
      breakMin: 60,
      totalHours: 0
    };

    const tr = document.createElement("tr");
    if (isWeekend) tr.classList.add("weekend");
    if (isToday) tr.classList.add("today");

    tr.innerHTML = `
      <td><strong>${day}일</strong> (${dayName}) ${isToday ? "👁️" : ""}</td>
      <td>
        <select data-date="${dateStr}" class="type-select">
          <option value="정상" ${record.type === "정상" ? "selected" : ""}>생명력 공물 바치기 (정상)</option>
          <option value="연차" ${record.type === "연차" ? "selected" : ""}>영혼 봉인 해제 (+8h 연차)</option>
          <option value="오전반차" ${record.type === "오전반차" ? "selected" : ""}>오전 결계 탈출 (+4h 반차)</option>
          <option value="오후반차" ${record.type === "오후반차" ? "selected" : ""}>오후 결계 탈출 (+4h 반차)</option>
          <option value="휴일" ${record.type === "휴일" ? "selected" : ""}>공허의 안식일 (휴일/주말)</option>
        </select>
      </td>
      <td><input type="time" data-date="${dateStr}" class="start-time" value="${record.start || ""}" ${record.type === "연차" || record.type === "휴일" ? "disabled" : ""}></td>
      <td><input type="time" data-date="${dateStr}" class="end-time" value="${record.end || ""}" ${record.type === "연차" || record.type === "휴일" ? "disabled" : ""}></td>
      <td><input type="number" data-date="${dateStr}" class="break-min" value="${record.breakMin ?? 60}" step="10" min="0" style="width: 55px;" ${record.type === "연차" || record.type === "휴일" ? "disabled" : ""}></td>
      <td><span class="day-total-badge" id="badge-${dateStr}">${(record.totalHours || 0).toFixed(1)}</span> <span style="font-size:0.75rem; color:#64748b;">h</span></td>
    `;

    tableBody.appendChild(tr);
  }

  attachTableEvents();
}

function attachTableEvents() {
  tableBody.querySelectorAll(".type-select").forEach((el) => {
    el.addEventListener("change", (e) => {
      const date = e.target.dataset.date;
      const type = e.target.value;
      if (!monthData[date]) monthData[date] = { breakMin: 60 };
      monthData[date].type = type;

      renderCalendar();
      calculateAll();
      saveLocalStorage();
      syncDayToSheet(date);
    });
  });

  const timeInputs = tableBody.querySelectorAll(".start-time, .end-time, .break-min");
  timeInputs.forEach((input) => {
    input.addEventListener("input", (e) => {
      const date = e.target.dataset.date;
      const row = e.target.closest("tr");
      const type = row.querySelector(".type-select").value;
      const start = row.querySelector(".start-time").value;
      const end = row.querySelector(".end-time").value;
      const breakMin = parseInt(row.querySelector(".break-min").value) || 0;

      monthData[date] = { type, start, end, breakMin };
      calculateAll();
      saveLocalStorage();
      syncDayToSheet(date);
    });
  });
}

function calculateAll() {
  const [year, month] = currentYearMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const todayDate = now.getDate();
  const isCurrentMonth = currentYear === year && Number(currentMonth) === month;

  let totalWorked = 0;
  let futureRemainingWorkdays = 0;

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${currentYearMonth}-${String(day).padStart(2, "0")}`;
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const record = monthData[dateStr] || {
      type: isWeekend ? "휴일" : "정상",
      start: "",
      end: "",
      breakMin: 60
    };

    let dayHours = 0;

    if (record.type === "연차") {
      dayHours = 8;
    } else if (record.type === "오전반차" || record.type === "오후반차") {
      dayHours = 4 + calculateWorkHours(record.start, record.end, record.breakMin);
    } else if (record.type === "정상") {
      dayHours = calculateWorkHours(record.start, record.end, record.breakMin);
    }

    monthData[dateStr] = { ...record, totalHours: dayHours };

    const badge = document.getElementById(`badge-${dateStr}`);
    if (badge) {
      badge.textContent = dayHours.toFixed(1);
    }

    totalWorked += dayHours;

    const isFuture = isCurrentMonth ? day > todayDate : true;
    if (isFuture && !isWeekend && record.type !== "휴일" && record.type !== "연차") {
      futureRemainingWorkdays++;
    }
  }

  const remaining = Math.max(0, targetHours - totalWorked);
  totalWorkedEl.textContent = totalWorked.toFixed(1);
  remainingHoursEl.textContent = remaining.toFixed(1);

  if (totalWorked >= targetHours) {
    remainingStatus.textContent = "🌌 축하합니다. 심연의 지배로부터 해방되었습니다!";
    dailyRecommendedEl.textContent = "0.0";
    remainingWorkdaysText.textContent = `남은 생존 평일: ${futureRemainingWorkdays}일 (조기 퇴근 가능)`;
  } else {
    remainingStatus.textContent = `심연의 부채 ${(targetHours - totalWorked).toFixed(1)}시간 미납 상태`;
    if (futureRemainingWorkdays > 0) {
      const dailyReq = remaining / futureRemainingWorkdays;
      dailyRecommendedEl.textContent = dailyReq.toFixed(1);
      remainingWorkdaysText.textContent = `생존 평일 ${futureRemainingWorkdays}일 분할 상환 기준`;
    } else {
      dailyRecommendedEl.textContent = remaining.toFixed(1);
      remainingWorkdaysText.textContent = "상환할 남은 평일이 없습니다. 야근 확정!";
    }
  }
}

function calculateWorkHours(startStr, endStr, breakMin = 60) {
  if (!startStr || !endStr) return 0;
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) return 0;
  const netMinutes = endMinutes - startMinutes - breakMin;
  return Math.max(0, netMinutes / 60);
}

init();