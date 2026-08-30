const API_URL = "https://script.google.com/macros/s/AKfycbwmWqksuzme7jmILZCJKND-jvJ9FxDdBt_IMUpPip0diOCst44WIUzYppZVr133RDLCXg/exec";
const ADMIN_PASSWORD = "admin1234"; // 관리자 삭제 비밀번호

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
const remainingHoursEl = document.getElementById("remainingHours");
const dailyRecommendedEl = document.getElementById("dailyRecommended");
const remainingWorkdaysText = document.getElementById("remainingWorkdaysText");
const remainingStatus = document.getElementById("remainingStatus");
const syncStatusEl = document.getElementById("syncStatus");
const currentCrewName = document.getElementById("currentCrewName");
const tableCrewName = document.getElementById("tableCrewName");

function init() {
  monthPicker.value = currentYearMonth;
  
  loadUsers();
  updateViewVisibility();

  if (currentUser) {
    loadLocalStorage();
    renderCalendar();
    calculateAll();
  }
  
  fetchSheetData();

  if (btnRegisterMain) {
    btnRegisterMain.addEventListener("click", promptNewUser);
  }

  monthPicker.addEventListener("change", (e) => {
    currentYearMonth = e.target.value;
    if (currentUser) {
      loadLocalStorage();
      renderCalendar();
      calculateAll();
      fetchSheetData();
    }
  });

  targetHoursInput.addEventListener("input", (e) => {
    targetHours = parseFloat(e.target.value) || 0;
    if (currentUser) {
      saveLocalStorage();
      calculateAll();
    }
  });
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
    nameBtn.addEventListener("click", () => {
      if (currentUser !== user) {
        currentUser = user;
        saveUsers();
        updateViewVisibility();
        loadLocalStorage();
        renderCalendar();
        calculateAll();
        fetchSheetData();
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

async function fetchSheetData() {
  syncStatusEl.textContent = "🍟 주문 접수 중...";
  syncStatusEl.className = "sync-badge saving";

  try {
    const url = currentUser 
      ? `${API_URL}?user=${encodeURIComponent(currentUser)}&month=${currentYearMonth}`
      : API_URL;

    const res = await fetch(url);
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
          if (!currentUser && userList.length > 0) {
            currentUser = userList[0];
          }
          updateViewVisibility();
        }
      }

      if (currentUser && result.data) {
        monthData = { ...monthData, ...result.data };
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

      syncStatusEl.textContent = "🍔 동기화 완료";
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

    const isOff = record.type === "연차" || record.type === "휴일";

    const tr = document.createElement("tr");
    if (isWeekend) tr.classList.add("weekend");
    if (isToday) tr.classList.add("today");

    tr.innerHTML = `
      <td><strong>${day}일</strong> (${dayName}) ${isToday ? "📍" : ""}</td>
      <td>
        <select data-date="${dateStr}" class="type-select">
          <option value="정상" ${record.type === "정상" ? "selected" : ""}>🍟 정상근무</option>
          <option value="연차" ${record.type === "연차" ? "selected" : ""}>🏖️ 연차 (+8h)</option>
          <option value="오전반차" ${record.type === "오전반차" ? "selected" : ""}>🌅 오전반차 (+4h)</option>
          <option value="오후반차" ${record.type === "오후반차" ? "selected" : ""}>🌇 오후반차 (+4h)</option>
          <option value="휴일" ${record.type === "휴일" ? "selected" : ""}>☕ 휴일/주말</option>
        </select>
      </td>
      <td><input type="time" data-date="${dateStr}" class="start-time" value="${record.start || ""}" ${isOff ? "disabled" : ""}></td>
      <td><input type="time" data-date="${dateStr}" class="end-time" value="${record.end || ""}" ${isOff ? "disabled" : ""}></td>
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

    // 포커스를 벗어날 때(blur) AM/PM 미완성 상태를 오전(AM)으로 자동 완성
    if (input.type === "time") {
      input.addEventListener("blur", (e) => {
        const val = e.target.value;
        const date = e.target.dataset.date;
        const row = e.target.closest("tr");

        // 만약 숫자는 들어갔으나 AM/PM이 비어 value가 안 읽힌 경우, 저장된 값 복구 및 오전 기본값 지정
        if (!val && monthData[date]) {
          const isStart = e.target.classList.contains("start-time");
          const prev = isStart ? monthData[date].start : monthData[date].end;
          if (prev) {
            e.target.value = prev;
          }
        }
        updateRowData(row, date);
      });
    }
  });
}

function calculateAll() {
  if (!currentUser) return;

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
      breakMin: 60,
      totalHours: 0
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
    remainingStatus.textContent = "🎉 이번 달 목표 달성 완료! 🍟";
    dailyRecommendedEl.textContent = "0.0";
    remainingWorkdaysText.textContent = `남은 평일: ${futureRemainingWorkdays}일 (조기 퇴근 가능)`;
  } else {
    remainingStatus.textContent = `목표까지 ${(targetHours - totalWorked).toFixed(1)}시간 남음`;
    if (futureRemainingWorkdays > 0) {
      const dailyReq = remaining / futureRemainingWorkdays;
      dailyRecommendedEl.textContent = dailyReq.toFixed(1);
      remainingWorkdaysText.textContent = `남은 평일 ${futureRemainingWorkdays}일 기준`;
    } else {
      dailyRecommendedEl.textContent = remaining.toFixed(1);
      remainingWorkdaysText.textContent = "남은 평일이 없습니다.";
    }
  }
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