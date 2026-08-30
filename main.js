const API_URL = "https://script.google.com/macros/s/AKfycbwmWqksuzme7jmILZCJKND-jvJ9FxDdBt_IMUpPip0diOCst44WIUzYppZVr133RDLCXg/exec";
const ADMIN_PASSWORD = "admin1234";

let currentUser = "";
let userList = [];
let currentYearMonth = "";
let targetHours = 168;
let monthData = {};
let syncDebounceTimers = {};

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
currentYearMonth = `${currentYear}-${currentMonth}`;

// DOM 엘리먼트
const crewTabsWrap = document.getElementById("crewTabsWrap");
const emptyCrewSection = document.getElementById("emptyCrewSection");
const mainContentSection = document.getElementById("mainContentSection");
const btnRegisterMain = document.getElementById("btnRegisterMain");
const monthPicker = document.getElementById("monthPicker");
const targetHoursInput = document.getElementById("targetHours");
const tableBody = document.getElementById("workTableBody");
const totalWorkedEl = document.getElementById("totalWorked");

// ⚡ 퀵 출퇴근 DOM
const todayDateDisplay = document.getElementById("todayDateDisplay");
const btnQuickIn = document.getElementById("btnQuickIn");
const btnQuickOut = document.getElementById("btnQuickOut");

// 연장근로 & 계획 시뮬레이션 DOM
const cardRemainingHours = document.getElementById("cardRemainingHours");
const titleRemainingHours = document.getElementById("titleRemainingHours");
const remainingHoursEl = document.getElementById("remainingHours");
const remainingStatus = document.getElementById("remainingStatus");
const expectedOvertimeHoursEl = document.getElementById("expectedOvertimeHours");
const expectedOvertimeDescEl = document.getElementById("expectedOvertimeDesc");
const overtimeAlertBanner = document.getElementById("overtimeAlertBanner");
const overtimeAlertMsg = document.getElementById("overtimeAlertMsg");

// 미니 계산기 DOM
const calcHourlyWageInput = document.getElementById("calcHourlyWage");
const calcOvertimeHoursInput = document.getElementById("calcOvertimeHours");
const calcResultAmountEl = document.getElementById("calcResultAmount");

const syncStatusEl = document.getElementById("syncStatus");
const currentCrewName = document.getElementById("currentCrewName");
const tableCrewName = document.getElementById("tableCrewName");

// 현재 시각 가져오기 (HH:mm)
function getCurrentTimeString() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// 오늘 날짜 포맷 (YYYY-MM-DD)
function getTodayDateString() {
  const d = new Date();
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

// ⚡ 오늘 출근/퇴근 원클릭 등록
function punchTime(type) {
  if (!currentUser) {
    alert("먼저 크루 닉네임을 선택하거나 등록해 주세요.");
    return;
  }

  const todayStr = getTodayDateString();
  const todayMonth = todayStr.substring(0, 7);

  // 만약 조회 중인 월과 오늘 월이 다르면 오늘 월로 변경
  if (currentYearMonth !== todayMonth) {
    currentYearMonth = todayMonth;
    monthPicker.value = todayMonth;
    loadLocalStorage();
    renderCalendar();
  }

  const timeStr = getCurrentTimeString();
  const currentRecord = monthData[todayStr] || {
    type: "정상",
    start: "",
    end: "",
    breakMin: 60,
    totalHours: 0
  };

  if (type === "IN") {
    currentRecord.start = timeStr;
    if (currentRecord.type === "휴일") currentRecord.type = "정상";
  } else if (type === "OUT") {
    currentRecord.end = timeStr;
    if (currentRecord.type === "휴일") currentRecord.type = "정상";
  }

  monthData[todayStr] = currentRecord;
  saveLocalStorage();
  renderCalendar();
  calculateAll();
  syncDayToSheet(todayStr);

  const actionName = type === "IN" ? "출근" : "퇴근";
  alert(`🍟 [${todayStr}] ${actionName} 시간이 [${timeStr}] 로 등록되었습니다!`);
}

function runMiniCalculator() {
  if (!calcHourlyWageInput || !calcOvertimeHoursInput || !calcResultAmountEl) return;
  const rawWage = String(calcHourlyWageInput.value).replace(/,/g, "").trim();
  const rawHours = String(calcOvertimeHoursInput.value).replace(/,/g, "").trim();
  
  const wage = parseFloat(rawWage) || 0;
  const hours = parseFloat(rawHours) || 0;
  
  const total = Math.round(wage * hours * 1.5);
  calcResultAmountEl.textContent = total.toLocaleString("ko-KR");
}

async function init() {
  monthPicker.value = currentYearMonth;
  
  // 오늘 날짜 헤더 표시
  if (todayDateDisplay) {
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    todayDateDisplay.textContent = `(${now.getMonth() + 1}월 ${now.getDate()}일 ${dayNames[now.getDay()]}요일)`;
  }

  loadUsers();
  updateViewVisibility();

  if (currentUser) {
    loadLocalStorage();
    renderCalendar();
    calculateAll();
  }
  
  await fetchSheetData();

  if (btnRegisterMain) {
    btnRegisterMain.addEventListener("click", promptNewUser);
  }

  // ⚡ 퀵 버튼 이벤트
  if (btnQuickIn) btnQuickIn.addEventListener("click", () => punchTime("IN"));
  if (btnQuickOut) btnQuickOut.addEventListener("click", () => punchTime("OUT"));

  monthPicker.addEventListener("change", async (e) => {
    currentYearMonth = e.target.value;
    if (currentUser) {
      loadLocalStorage();
      renderCalendar();
      calculateAll();
      await fetchSheetData();
    }
  });

  targetHoursInput.addEventListener("input", (e) => {
    targetHours = parseFloat(e.target.value) || 0;
    if (currentUser) {
      saveLocalStorage();
      calculateAll();
    }
  });

  if (calcHourlyWageInput && calcOvertimeHoursInput) {
    ["input", "change", "keyup", "blur"].forEach(evtName => {
      calcHourlyWageInput.addEventListener(evtName, runMiniCalculator);
      calcOvertimeHoursInput.addEventListener(evtName, runMiniCalculator);
    });
    
    calcOvertimeHoursInput.addEventListener("focus", () => {
      calcOvertimeHoursInput.dataset.touched = "true";
    });

    runMiniCalculator();
  }
}

function isValidCrewName(name) {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") return false;
  
  const dummyNames = ["크루 1", "크루 2", "크루 3", "크루1", "크루2", "크루3", "미지정크루"];
  if (dummyNames.includes(trimmed)) return false;

  if (trimmed.includes("GMT") || trimmed.includes("표준시") || /^\d{4}[-/.]\d{2}/.test(trimmed)) {
    return false;
  }
  return true;
}

function updateViewVisibility() {
  if (!currentUser) {
    if (emptyCrewSection) emptyCrewSection.style.display = "block";
    if (mainContentSection) mainContentSection.style.display = "none";
  } else {
    if (emptyCrewSection) emptyCrewSection.style.display = "none";
    if (mainContentSection) mainContentSection.style.display = "block";
  }
  renderCrewTabs();
  updateCrewLabels();
}

function promptNewUser() {
  const name = prompt("본인의 크루 닉네임(또는 이름)을 입력해 주세요:");
  if (name && name.trim() && isValidCrewName(name)) {
    const cleanName = name.trim();
    if (!userList.includes(cleanName)) {
      userList.push(cleanName);
    }
    currentUser = cleanName;
    saveUsers();
    updateViewVisibility();
    loadLocalStorage();
    renderCalendar();
    calculateAll();
    fetchSheetData();
  } else if (name) {
    alert("올바른 닉네임을 입력해 주세요.");
  }
}

function renderCrewTabs() {
  crewTabsWrap.innerHTML = "";

  userList.forEach((user) => {
    const tabItem = document.createElement("div");
    tabItem.className = `crew-tab-item ${user === currentUser ? "active" : ""}`;

    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "crew-tab-name";
    nameBtn.textContent = `👤 ${user}`;
    nameBtn.addEventListener("click", async () => {
      if (currentUser !== user) {
        currentUser = user;
        saveUsers();
        updateViewVisibility();
        loadLocalStorage();
        renderCalendar();
        calculateAll();
        await fetchSheetData();
      }
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-delete-crew";
    delBtn.title = "크루 삭제 (관리자)";
    delBtn.innerHTML = "✕";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteCrew(user);
    });

    tabItem.appendChild(nameBtn);
    tabItem.appendChild(delBtn);
    crewTabsWrap.appendChild(tabItem);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn-add-crew-tab";
  addBtn.textContent = "+ 내 닉네임 등록";
  addBtn.addEventListener("click", promptNewUser);
  crewTabsWrap.appendChild(addBtn);
}

async function handleDeleteCrew(targetUser) {
  const pw = prompt(`[${targetUser}] 크루를 삭제하시겠습니까?\n관리자 비밀번호를 입력하세요:`);
  if (pw === null) return;

  if (pw !== ADMIN_PASSWORD) {
    alert("⚠️ 비밀번호가 일치하지 않습니다.");
    return;
  }

  if (!confirm(`정말로 [${targetUser}] 크루와 관련된 시트의 모든 데이터를 영구 삭제하시겠습니까?`)) {
    return;
  }

  userList = userList.filter(u => u !== targetUser);
  if (currentUser === targetUser) {
    currentUser = userList.length > 0 ? userList[0] : "";
  }
  saveUsers();
  updateViewVisibility();

  if (currentUser) {
    loadLocalStorage();
    renderCalendar();
    calculateAll();
  }

  syncStatusEl.textContent = "🗑️ 시트 데이터 삭제 중...";
  syncStatusEl.className = "sync-badge saving";

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "DELETE", user: targetUser })
    });
    const result = await res.json();
    if (result.status === "success") {
      syncStatusEl.textContent = "🍔 삭제 완료";
      syncStatusEl.className = "sync-badge";
      alert(`[${targetUser}] 크루가 시트 및 목록에서 완전히 삭제되었습니다.`);
    }
  } catch (err) {
    console.error(err);
    syncStatusEl.textContent = "⚠️ 삭제 실패";
    syncStatusEl.className = "sync-badge";
  }
}

function updateCrewLabels() {
  if (currentCrewName) currentCrewName.textContent = currentUser || "-";
  if (tableCrewName) tableCrewName.textContent = currentUser || "-";
}

function loadUsers() {
  const savedUsers = localStorage.getItem("mcrew_user_list");
  if (savedUsers) {
    try {
      const parsed = JSON.parse(savedUsers);
      userList = Array.isArray(parsed) ? parsed.filter(isValidCrewName) : [];
    } catch (e) {
      userList = [];
    }
  } else {
    userList = [];
  }

  const lastUser = localStorage.getItem("mcrew_last_user");
  if (lastUser && userList.includes(lastUser) && isValidCrewName(lastUser)) {
    currentUser = lastUser;
  } else if (userList.length > 0) {
    currentUser = userList[0];
  } else {
    currentUser = "";
  }
}

function saveUsers() {
  userList = userList.filter(isValidCrewName);
  localStorage.setItem("mcrew_user_list", JSON.stringify(userList));
  localStorage.setItem("mcrew_last_user", currentUser);
}

function getStorageKey() {
  return `mcrew_${currentUser}_${currentYearMonth}`;
}

function loadLocalStorage() {
  if (!currentUser) return;
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
  if (!currentUser) return;
  localStorage.setItem(
    getStorageKey(),
    JSON.stringify({ targetHours, monthData })
  );
  saveUsers();
}

function cleanTimeFormat(timeStr) {
  if (!timeStr) return "";
  const str = String(timeStr).trim();
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return "";
}

async function fetchSheetData() {
  syncStatusEl.textContent = "🍟 데이터 불러오는 중...";
  syncStatusEl.className = "sync-badge saving";

  try {
    const cacheBuster = `&_t=${Date.now()}`;
    const url = currentUser 
      ? `${API_URL}?user=${encodeURIComponent(currentUser)}&month=${currentYearMonth}${cacheBuster}`
      : `${API_URL}?_t=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    const result = await res.json();
    
    if (result.status === "success") {
      if (result.users && result.users.length > 0) {
        let added = false;
        result.users.forEach(u => {
          const cleanU = String(u).trim();
          if (isValidCrewName(cleanU) && !userList.includes(cleanU)) {
            userList.push(cleanU);
            added = true;
          }
        });
        if (added) {
          saveUsers();
        }
        if (!currentUser && userList.length > 0) {
          currentUser = userList[0];
          saveUsers();
        }
        updateViewVisibility();
      }

      if (result.data) {
        const formattedData = {};
        Object.keys(result.data).forEach(dateKey => {
          const item = result.data[dateKey];
          formattedData[dateKey] = {
            type: item.type || "정상",
            start: cleanTimeFormat(item.start),
            end: cleanTimeFormat(item.end),
            breakMin: item.breakMin !== undefined ? Number(item.breakMin) : 60,
            totalHours: Number(item.totalHours) || 0
          };
        });

        if (Object.keys(formattedData).length > 0) {
          monthData = formattedData;
        }
      }

      if (result.targetHours) {
        targetHours = result.targetHours;
        targetHoursInput.value = targetHours;
      }

      if (currentUser) {
        saveLocalStorage();
        renderCalendar();
        calculateAll();
      }

      syncStatusEl.textContent = "🍔 시트 불러오기 완료";
      syncStatusEl.className = "sync-badge";
    }
  } catch (err) {
    console.error(err);
    syncStatusEl.textContent = "⚠️ 오프라인";
    syncStatusEl.className = "sync-badge";
  }
}

function syncDayToSheet(dateStr) {
  if (!currentUser) return;

  syncStatusEl.textContent = "🍟 저장 중...";
  syncStatusEl.className = "sync-badge saving";

  if (syncDebounceTimers[dateStr]) {
    clearTimeout(syncDebounceTimers[dateStr]);
  }

  syncDebounceTimers[dateStr] = setTimeout(async () => {
    const record = monthData[dateStr] || {};
    const payload = {
      user: currentUser,
      date: dateStr,
      type: record.type || "정상",
      start: record.start || "",
      end: record.end || "",
      breakMin: record.breakMin !== undefined ? Number(record.breakMin) : 60,
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
      syncStatusEl.textContent = "🍔 시트 저장 완료";
      syncStatusEl.className = "sync-badge";
    } catch (err) {
      console.error(err);
      syncStatusEl.textContent = "⚠️ 로컬 보관";
      syncStatusEl.className = "sync-badge";
    }
  }, 600);
}

function renderCalendar() {
  tableBody.innerHTML = "";
  if (!currentUser) return;

  const [year, month] = currentYearMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const todayDate = now.getDate();
  const isCurrentMonth = currentYear === year && Number(currentMonth) === month;
  const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, "0")}`;

  for (let day = totalDays; day >= 1; day--) {
    const dateStr = `${currentYearMonth}-${String(day).padStart(2, "0")}`;
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeekNum = dateObj.getDay();
    const dayOfWeekNames = ["일", "월", "화", "수", "목", "금", "토"];
    const dayName = dayOfWeekNames[dayOfWeekNum];
    const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
    const isToday = dateStr === todayStr;
    const isFuture = isCurrentMonth ? day > todayDate : false;

    const record = monthData[dateStr] || {
      type: isWeekend ? "휴일" : "정상",
      start: "",
      end: "",
      breakMin: 60,
      totalHours: 0
    };

    const hasInput = (record.start && record.end) || record.type === "연차" || record.type === "오전반차" || record.type === "오후반차";
    const isPlanned = isFuture && hasInput;
    const isOff = record.type === "연차" || record.type === "휴일";

    const tr = document.createElement("tr");
    if (isWeekend) tr.classList.add("weekend");
    if (isToday) tr.classList.add("today");
    if (isPlanned) tr.classList.add("planned-row");

    tr.innerHTML = `
      <td>
        <strong>${day}일</strong> (${dayName}) 
        ${isToday ? "📍" : ""}
        ${isPlanned ? '<span class="planned-tag">계획</span>' : ""}
      </td>
      <td>
        <select data-date="${dateStr}" class="type-select">
          <option value="정상" ${record.type === "정상" ? "selected" : ""}>🍟 정상근무</option>
          <option value="연차" ${record.type === "연차" ? "selected" : ""}>🏖️ 연차 (+8h)</option>
          <option value="오전반차" ${record.type === "오전반차" ? "selected" : ""}>🌅 오전반차 (+4h)</option>
          <option value="오후반차" ${record.type === "오후반차" ? "selected" : ""}>🌇 오후반차 (+4h)</option>
          <option value="휴일" ${record.type === "휴일" ? "selected" : ""}>☕ 휴일/주말</option>
        </select>
      </td>
      <td>
        <div class="time-cell-wrap">
          <input type="time" data-date="${dateStr}" class="start-time" value="${record.start || ""}" ${isOff ? "disabled" : ""}>
          ${isToday ? '<button type="button" class="btn-now-mini btn-now-in" title="현재 시각 입력">지금</button>' : ""}
        </div>
      </td>
      <td>
        <div class="time-cell-wrap">
          <input type="time" data-date="${dateStr}" class="end-time" value="${record.end || ""}" ${isOff ? "disabled" : ""}>
          ${isToday ? '<button type="button" class="btn-now-mini btn-now-out" title="현재 시각 입력">지금</button>' : ""}
        </div>
      </td>
      <td><input type="number" data-date="${dateStr}" class="break-min" value="${record.breakMin ?? 60}" step="10" min="0" style="width: 60px;" ${isOff ? "disabled" : ""}></td>
      <td><span class="day-total-badge" id="badge-${dateStr}">${(record.totalHours || 0).toFixed(1)}</span> 시간</td>
    `;

    tableBody.appendChild(tr);
  }

  attachTableEvents();
}

function updateRowData(row, date) {
  const type = row.querySelector(".type-select").value;
  const startInput = row.querySelector(".start-time");
  const endInput = row.querySelector(".end-time");
  const breakInput = row.querySelector(".break-min");

  const start = startInput.value;
  const end = endInput.value;
  const breakMin = parseInt(breakInput.value, 10) >= 0 ? parseInt(breakInput.value, 10) : 60;

  monthData[date] = {
    type,
    start,
    end,
    breakMin,
    totalHours: 0
  };

  calculateAll();
  saveLocalStorage();
  syncDayToSheet(date);
}

function attachTableEvents() {
  tableBody.querySelectorAll(".type-select").forEach((el) => {
    el.addEventListener("change", (e) => {
      const date = e.target.dataset.date;
      const row = e.target.closest("tr");
      const type = e.target.value;

      const startInput = row.querySelector(".start-time");
      const endInput = row.querySelector(".end-time");
      const breakInput = row.querySelector(".break-min");

      const isOff = type === "연차" || type === "휴일";
      startInput.disabled = isOff;
      endInput.disabled = isOff;
      breakInput.disabled = isOff;

      updateRowData(row, date);
      renderCalendar();
    });
  });

  const rowInputs = tableBody.querySelectorAll(".start-time, .end-time, .break-min");
  rowInputs.forEach((input) => {
    const handleInput = (e) => {
      const date = e.target.dataset.date;
      const row = e.target.closest("tr");
      updateRowData(row, date);
    };

    input.addEventListener("input", handleInput);
    input.addEventListener("change", handleInput);

    if (input.type === "time") {
      input.addEventListener("blur", (e) => {
        const val = e.target.value;
        const date = e.target.dataset.date;
        const row = e.target.closest("tr");

        if (!val && monthData[date]) {
          const isStart = e.target.classList.contains("start-time");
          const prev = isStart ? monthData[date].start : monthData[date].end;
          if (prev) {
            e.target.value = prev;
          }
        }
        updateRowData(row, date);
        renderCalendar();
      });
    }
  });

  // 오늘 행의 미니 '지금' 버튼 이벤트
  const miniIn = tableBody.querySelector(".btn-now-in");
  const miniOut = tableBody.querySelector(".btn-now-out");
  if (miniIn) miniIn.addEventListener("click", () => punchTime("IN"));
  if (miniOut) miniOut.addEventListener("click", () => punchTime("OUT"));
}

function calculateAll() {
  if (!currentUser) return;

  const [year, month] = currentYearMonth.split("-").map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  const todayDate = now.getDate();
  const isCurrentMonth = currentYear === year && Number(currentMonth) === month;

  let actualWorked = 0;
  let plannedWorked = 0;
  let futureEmptyWorkdays = 0;

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

    record.totalHours = dayHours;
    monthData[dateStr] = record;

    const badge = document.getElementById(`badge-${dateStr}`);
    if (badge) {
      badge.textContent = dayHours.toFixed(1);
    }

    const isFuture = isCurrentMonth ? day > todayDate : false;

    if (!isFuture) {
      actualWorked += dayHours;
    } else {
      if (dayHours > 0 || record.type === "연차" || record.type === "오전반차" || record.type === "오후반차") {
        plannedWorked += dayHours;
      } else if (!isWeekend && record.type !== "휴일") {
        futureEmptyWorkdays++;
      }
    }
  }

  totalWorkedEl.textContent = actualWorked.toFixed(1);

  const isActualOver = actualWorked >= targetHours;
  const currentActualOvertime = Math.max(0, actualWorked - targetHours);
  const remainingToTarget = Math.max(0, targetHours - actualWorked);

  if (isActualOver) {
    titleRemainingHours.textContent = "🔥 현재 실근무 초과 시간";
    remainingHoursEl.textContent = `+${currentActualOvertime.toFixed(1)}`;
    cardRemainingHours.className = "metric-card overtime-card";
    remainingStatus.textContent = `목표(${targetHours}h) 대비 +${currentActualOvertime.toFixed(1)}h 초과 중`;
  } else {
    titleRemainingHours.textContent = "목표까지 남은 시간";
    remainingHoursEl.textContent = remainingToTarget.toFixed(1);
    cardRemainingHours.className = "metric-card";
    remainingStatus.textContent = `목표까지 ${remainingToTarget.toFixed(1)}시간 남음`;
  }

  const totalProjectedHours = actualWorked + plannedWorked + (futureEmptyWorkdays * 8);
  const diffFromTarget = totalProjectedHours - targetHours;

  if (diffFromTarget > 0) {
    expectedOvertimeHoursEl.textContent = `+${diffFromTarget.toFixed(1)}h 초과`;
    expectedOvertimeHoursEl.style.color = "var(--mcd-red)";
    expectedOvertimeDescEl.textContent = `계획 ${plannedWorked.toFixed(1)}h + 미입력 ${futureEmptyWorkdays}일(8h) 반영 시`;
  } else if (diffFromTarget < 0) {
    expectedOvertimeHoursEl.textContent = `${Math.abs(diffFromTarget).toFixed(1)}h 부족`;
    expectedOvertimeHoursEl.style.color = "#0b63b8";
    expectedOvertimeDescEl.textContent = `계획 ${plannedWorked.toFixed(1)}h + 미입력 ${futureEmptyWorkdays}일(8h) 반영 시`;
  } else {
    expectedOvertimeHoursEl.textContent = "딱 0.0h (목표 달성)";
    expectedOvertimeHoursEl.style.color = "#27ae60";
    expectedOvertimeDescEl.textContent = "목표시간과 정확히 일치합니다! 🍟";
  }

  if (isActualOver || diffFromTarget > 0) {
    overtimeAlertBanner.style.display = "flex";
    if (isActualOver) {
      overtimeAlertMsg.textContent = `현재 실근무가 이미 ${currentActualOvertime.toFixed(1)}시간 초과되었습니다! (남은 계획 반영 시 최종 +${diffFromTarget.toFixed(1)}시간 예상)`;
    } else {
      overtimeAlertMsg.textContent = `내일 이후 계획된 일정을 진행할 경우 최종 약 +${diffFromTarget.toFixed(1)}시간 초과될 예정입니다. 연장근로신청을 미리 올려주세요.`;
    }
  } else {
    overtimeAlertBanner.style.display = "none";
  }

  if (calcOvertimeHoursInput && !calcOvertimeHoursInput.dataset.touched) {
    const autoHours = diffFromTarget > 0 ? diffFromTarget : 0;
    calcOvertimeHoursInput.value = autoHours > 0 ? autoHours.toFixed(1) : "";
  }
  runMiniCalculator();
}

function calculateWorkHours(startStr, endStr, breakMin = 60) {
  if (!startStr || !endStr) return 0;

  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);

  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (endMinutes <= startMinutes) return 0;

  const bMin = isNaN(breakMin) ? 60 : Number(breakMin);
  const netMinutes = endMinutes - startMinutes - bMin;
  
  return Math.max(0, netMinutes / 60);
}

init();