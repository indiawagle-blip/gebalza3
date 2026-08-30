const API_URL = "https://script.google.com/macros/s/AKfycbwh7SouQXxArlKFzdzUa1NAgvdwKb7bXgeMV43OXDOEUkHzDItbWmFhdFMT0slZQN1YTQ/exec";

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

  btnRegisterMain.addEventListener("click", promptNewUser);

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

function updateViewVisibility() {
  if (!currentUser) {
    emptyCrewSection.style.display = "block";
    mainContentSection.style.display = "none";
  } else {
    emptyCrewSection.style.display = "none";
    mainContentSection.style.display = "block";
  }
  renderCrewTabs();
  updateCrewLabels();
}

function promptNewUser() {
  const name = prompt("본인의 크루 닉네임(또는 이름)을 입력해 주세요:");
  if (name && name.trim()) {
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
  }
}

function renderCrewTabs() {
  crewTabsWrap.innerHTML = "";

  userList.forEach((user) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `crew-tab-btn ${user === currentUser ? "active" : ""}`;
    btn.textContent = `👤 ${user}`;
    btn.addEventListener("click", () => {
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
    crewTabsWrap.appendChild(btn);
  });

  // '+ 내 닉네임 등록' 버튼
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn-add-crew-tab";
  addBtn.textContent = "+ 내 닉네임 등록";
  addBtn.addEventListener("click", promptNewUser);
  crewTabsWrap.appendChild(addBtn);
}

function updateCrewLabels() {
  currentCrewName.textContent = currentUser || "-";
  tableCrewName.textContent = currentUser || "-";
}

function loadUsers() {
  const savedUsers = localStorage.getItem("mcrew_user_list");
  if (savedUsers) {
    userList = JSON.parse(savedUsers);
  } else {
    userList = [];
  }

  const lastUser = localStorage.getItem("mcrew_last_user");
  if (lastUser && userList.includes(lastUser)) {
    currentUser = lastUser;
  } else if (userList.length > 0) {
    currentUser = userList[0];
  } else {
    currentUser = "";
  }
}

function saveUsers() {
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
          if (!userList.includes(u)) {
            userList.push(u);
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
      <td><input type="time" data-date="${dateStr}" class="start-time" value="${record.start || ""}" ${record.type === "연차" || record.type === "휴일" ? "disabled" : ""}></td>
      <td><input type="time" data-date="${dateStr}" class="end-time" value="${record.end || ""}" ${record.type === "연차" || record.type === "휴일" ? "disabled" : ""}></td>
      <td><input type="number" data-date="${dateStr}" class="break-min" value="${record.breakMin ?? 60}" step="10" min="0" style="width: 60px;" ${record.type === "연차" || record.type === "휴일" ? "disabled" : ""}></td>
      <td><span class="day-total-badge" id="badge-${dateStr}">${(record.totalHours || 0).toFixed(1)}</span> 시간</td>
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
    remainingStatus.textContent = "🎉 이번 달 목표 달성 완료! 🍟";
    dailyRecommendedEl.textContent = "0.0";
    remainingWorkdaysText.textContent = `남은 평일: ${futureRemainingWorkdays}일`;
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
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) return 0;
  const netMinutes = endMinutes - startMinutes - breakMin;
  return Math.max(0, netMinutes / 60);
}

init();
