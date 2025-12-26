(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    calendar: $("calendar"),
    yearInput: $("yearInput"),
    openFullscreenButton: $("openFullscreenButton"),
    calendarWrapper: $("calendarWrapper"),
    exportButton: $("exportButton"),
    importButton: $("importButton"),
    importFileInput: $("importFileInput"),

    subheadText: $("subheadText"),
    mainTitle: $("mainTitle"),
    mainDesc: $("mainDesc"),

    modeFocusBtn: $("modeFocusBtn"),
    modeBuildBtn: $("modeBuildBtn"),

    FocusPlanner: $("FocusPlanner"),
    FocusSidebar: $("FocusSidebar"),

    BuildBigMoves: $("BuildBigMoves"),
    BuildSessionsPanel: $("BuildSessionsPanel"),
    BuildSidebarHint: $("BuildSidebarHint"),

    dayPicker: $("dayPicker"),
    openCalendarToDayBtn: $("openCalendarToDayBtn"),
    dayTaskList: $("dayTaskList"),
    newDayTaskInput: $("newDayTaskInput"),
    addDayTaskBtn: $("addDayTaskBtn"),

    bigMovesList: $("bigMovesList"),
    newBigMoveInput: $("newBigMoveInput"),
    addBigMoveBtn: $("addBigMoveBtn"),
    bigMoveSelect: $("bigMoveSelect"),
    newBuildSessionInput: $("newBuildSessionInput"),
    scheduleBuildSessionBtn: $("scheduleBuildSessionBtn"),

    scheduleOverlay: $("scheduleOverlay"),
    scheduleOverlayText: $("scheduleOverlayText"),
    cancelScheduleButton: $("cancelScheduleButton"),

    dayPopup: $("dayPopup"),
    dayPopupTitle: $("dayPopupTitle"),
    dayPopupList: $("dayPopupList"),
    dayPopupNotes: $("dayPopupNotes"),
    closeDayPopup: $("closeDayPopup"),
  };

  const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const weekdayNames = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

  const key = {
    mode: (y) => `my-year-mode-${y}`,
    notes: (y) => `my-year-calendar-${y}`,
    bigMoves: (y) => `my-year-big-moves-${y}`,
    dayTasks: (y) => `my-year-day-tasks-${y}`,
  };

  const DAILY_SNAPSHOT_KEY = "my-year-daily-snapshot";
  const DAILY_PROMPT_LAST_KEY = "my-year-backup-prompt-last";
  const DAILY_PROMPT_SUPPRESS_KEY = "my-year-backup-prompt-suppress";

  const load = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };

  const makeId = () => `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const esc = (s) => String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  const yyyyMmDdLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };

  const todayDateKeyForYear = (year) => {
    const d = new Date();
    return d.getFullYear() !== year ? "0-1" : `${d.getMonth()}-${d.getDate()}`;
  };

  const formatDateKey = (dateKey) => {
    const [mStr, dStr] = String(dateKey).split("-");
    const m = Number(mStr), d = Number(dStr);
    return Number.isFinite(m) && Number.isFinite(d) && monthNames[m] ? `${monthNames[m]} ${d}` : "";
  };

  const normalizeBigMoves = (raw) => (Array.isArray(raw) ? raw : [])
    .map(v => {
      if (typeof v === "string") {
        const t = v.trim();
        return t ? { id: makeId(), text: t, done: false } : null;
      }
      if (!v || typeof v !== "object") return null;
      const text = String(v.text ?? "").trim();
      if (!text) return null;
      return { id: String(v.id ?? makeId()), text, done: Boolean(v.done) };
    })
    .filter(Boolean);

  const normalizeDayTasks = (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    for (const dk of Object.keys(raw)) {
      const arr = raw[dk];
      if (!Array.isArray(arr)) continue;
      out[dk] = arr.map(t => {
        if (typeof t === "string") {
          const tt = t.trim();
          return tt ? { id: makeId(), text: tt, done: false, kind: "Focus", bigMoveId: null } : null;
        }
        if (!t || typeof t !== "object") return null;
        const text = String(t.text ?? "").trim();
        if (!text) return null;
        const kind = (t.kind === "Build" || t.kind === "Focus") ? t.kind : "Focus";
        const bigMoveId = t.bigMoveId == null || t.bigMoveId === "" ? null : String(t.bigMoveId);
        return { id: String(t.id ?? makeId()), text, done: Boolean(t.done), kind, bigMoveId };
      }).filter(Boolean);
    }
    return out;
  };

  const downloadJson = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const S = {
    year: null,
    mode: "Focus",
    notes: {},
    bigMoves: [],
    dayTasks: {},
    selectedDayKey: null,
    scheduling: null,
  };

  const tasksFor = (dk) => Array.isArray(S.dayTasks[dk]) ? S.dayTasks[dk] : [];

  const buildAllDataObject = () => {
    const data = { mode: {}, calendarNotes: {}, bigMoves: {}, dayTasks: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("my-year-mode-")) data.mode[k.replace("my-year-mode-","")] = load(k, "Focus");
      if (k.startsWith("my-year-calendar-")) data.calendarNotes[k.replace("my-year-calendar-","")] = load(k, {});
      if (k.startsWith("my-year-big-moves-")) data.bigMoves[k.replace("my-year-big-moves-","")] = normalizeBigMoves(load(k, []));
      if (k.startsWith("my-year-day-tasks-")) data.dayTasks[k.replace("my-year-day-tasks-","")] = normalizeDayTasks(load(k, {}));
    }
    return data;
  };

  const writeDailyLocalSnapshot = () => {
    const today = yyyyMmDdLocal();
    const existing = load(DAILY_SNAPSHOT_KEY, null);
    if (existing && existing.dateISO === today) return;
    const data = buildAllDataObject();
    save(DAILY_SNAPSHOT_KEY, {
      dateISO: today,
      createdAt: new Date().toISOString(),
      filename: `my-year-backup-${today}.json`,
      data
    });
  };

  const maybePromptDailyDownload = () => {
    const today = yyyyMmDdLocal();
    if (localStorage.getItem(DAILY_PROMPT_LAST_KEY) === today) return;

    if (localStorage.getItem(DAILY_PROMPT_SUPPRESS_KEY) === today) {
      localStorage.setItem(DAILY_PROMPT_LAST_KEY, today);
      return;
    }

    const data = buildAllDataObject();
    const hasAnything =
      Object.keys(data.calendarNotes).length ||
      Object.keys(data.bigMoves).length ||
      Object.keys(data.dayTasks).length ||
      Object.keys(data.mode).length;

    if (!hasAnything) {
      localStorage.setItem(DAILY_PROMPT_LAST_KEY, today);
      return;
    }

    const ok = window.confirm(
      "Daily backup reminder:\n\nDownload a backup of your My Year data now?\n\n(Recommended if you ever clear browser data.)"
    );

    if (ok) downloadJson(data, `my-year-backup-${today}.json`);
    else localStorage.setItem(DAILY_PROMPT_SUPPRESS_KEY, today);

    localStorage.setItem(DAILY_PROMPT_LAST_KEY, today);
  };

  const tryRestoreFromDailySnapshotIfEmpty = () => {
    const snap = load(DAILY_SNAPSHOT_KEY, null);
    if (!snap?.data) return;

    let hasMyYear = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        (k.startsWith("my-year-mode-") || k.startsWith("my-year-calendar-") || k.startsWith("my-year-big-moves-") || k.startsWith("my-year-day-tasks-"))
      ) { hasMyYear = true; break; }
    }
    if (hasMyYear) return;

    const ok = window.confirm(
      `It looks like your My Year data is empty.\n\nA local snapshot exists from ${snap.dateISO}.\nRestore from it now?`
    );
    if (!ok) return;

    const p = snap.data;
    Object.keys(p.mode || {}).forEach(y => save(key.mode(y), p.mode[y] === "Build" ? "Build" : "Focus"));
    Object.keys(p.calendarNotes || {}).forEach(y => save(key.notes(y), p.calendarNotes[y] || {}));
    Object.keys(p.bigMoves || {}).forEach(y => save(key.bigMoves(y), normalizeBigMoves(p.bigMoves[y])));
    Object.keys(p.dayTasks || {}).forEach(y => save(key.dayTasks(y), normalizeDayTasks(p.dayTasks[y])));

    if (S.year != null) setYear(S.year);
    alert("Restored from local snapshot.");
  };

  const setTasksFor = (dk, arr) => {
    S.dayTasks[dk] = arr;
    save(key.dayTasks(S.year), S.dayTasks);
    writeDailyLocalSnapshot();
  };

  const findBigMove = (idVal) => S.bigMoves.find(b => b.id === idVal) || null;

  const setMode = (mode) => {
    S.mode = mode === "Build" ? "Build" : "Focus";
    save(key.mode(S.year), S.mode);

    el.modeFocusBtn.classList.toggle("active", S.mode === "Focus");
    el.modeBuildBtn.classList.toggle("active", S.mode === "Build");

    const isFocus = S.mode === "Focus";

    el.subheadText.innerHTML = isFocus
      ? "Focus Mode = survival + income. The calendar is for making effort visible."
      : "Build Mode = sessions that move your Big Moves forward.";

    el.mainTitle.textContent = isFocus ? "Focus Mode" : "Build Mode";
    el.mainDesc.textContent = isFocus
      ? "Plan daily tasks. They show on the calendar as text. Notes are optional."
      : "Define Big Moves (final goals). Schedule Build Sessions tied to one Big Move. Calendar becomes proof of progress.";

    el.FocusPlanner.style.display = isFocus ? "block" : "none";
    el.FocusSidebar.style.display = isFocus ? "block" : "none";

    el.BuildBigMoves.style.display = isFocus ? "none" : "block";
    el.BuildSessionsPanel.style.display = isFocus ? "none" : "block";
    el.BuildSidebarHint.style.display = isFocus ? "none" : "block";

    buildCalendar(S.year);
  };

  const buildDayPicker = (year) => {
    el.dayPicker.innerHTML = "";
    for (let m = 0; m < 12; m++) {
      const dim = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const opt = document.createElement("option");
        opt.value = `${m}-${d}`;
        opt.textContent = `${monthNames[m]} ${d}`;
        el.dayPicker.appendChild(opt);
      }
    }
    if (!S.selectedDayKey) S.selectedDayKey = todayDateKeyForYear(year);
    el.dayPicker.value = S.selectedDayKey;
  };

  const syncAddButtons = () => {
    el.addDayTaskBtn.disabled = !el.newDayTaskInput.value.trim();
    el.addBigMoveBtn.disabled = !el.newBigMoveInput.value.trim();
  };

  const renderSelectedDayTasks = () => {
    el.dayTaskList.innerHTML = "";
    const dk = S.selectedDayKey || todayDateKeyForYear(S.year);
    const tasks = tasksFor(dk).filter(t => t.kind === "Focus");

    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No tasks for this day yet.";
      el.dayTaskList.appendChild(empty);
      return;
    }

    const full = tasksFor(dk);
    tasks.forEach(t => {
      const idx = full.findIndex(x => x.id === t.id);

      const row = document.createElement("div");
      row.className = "item";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "check";
      check.checked = !!t.done;
      check.addEventListener("change", () => {
        t.done = check.checked;
        setTasksFor(dk, full);
        renderSelectedDayTasks();
        buildCalendar(S.year);
      });

      const mid = document.createElement("div");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "text" + (t.done ? " done" : "");
      input.value = t.text;
      input.addEventListener("input", () => {
        t.text = input.value;
        setTasksFor(dk, full);
        buildCalendar(S.year);
      });

      const meta = document.createElement("div");
      meta.className = "meta";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.innerHTML = `<strong>Day:</strong> <span>${esc(formatDateKey(dk))}</span>`;
      meta.appendChild(badge);

      mid.appendChild(input);
      mid.appendChild(meta);

      const buttons = document.createElement("div");
      buttons.className = "buttons";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        full.splice(idx, 1);
        setTasksFor(dk, full);
        renderSelectedDayTasks();
        buildCalendar(S.year);
      });

      buttons.appendChild(del);

      row.appendChild(check);
      row.appendChild(mid);
      row.appendChild(buttons);
      el.dayTaskList.appendChild(row);
    });
  };

  const renderBigMoves = () => {
    el.bigMovesList.innerHTML = "";

    if (!S.bigMoves.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No big moves yet. Add a final goal you want to drive toward.";
      el.bigMovesList.appendChild(empty);
      return;
    }

    S.bigMoves.forEach((bm, index) => {
      const row = document.createElement("div");
      row.className = "item";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "check";
      check.checked = !!bm.done;
      check.addEventListener("change", () => {
        bm.done = check.checked;
        save(key.bigMoves(S.year), S.bigMoves);
        writeDailyLocalSnapshot();
        renderBigMoves();
        rebuildBigMoveSelect();
      });

      const mid = document.createElement("div");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "text" + (bm.done ? " done" : "");
      input.value = bm.text;
      input.addEventListener("input", () => {
        bm.text = input.value;
        save(key.bigMoves(S.year), S.bigMoves);
        writeDailyLocalSnapshot();
        rebuildBigMoveSelect();
        buildCalendar(S.year);
      });

      const meta = document.createElement("div");
      meta.className = "meta";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.innerHTML = `<strong>Status:</strong> <span>${bm.done ? "Done" : "Active"}</span>`;
      meta.appendChild(badge);

      mid.appendChild(input);
      mid.appendChild(meta);

      const buttons = document.createElement("div");
      buttons.className = "buttons";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const removed = S.bigMoves.splice(index, 1)[0];
        save(key.bigMoves(S.year), S.bigMoves);
        writeDailyLocalSnapshot();

        for (const dk of Object.keys(S.dayTasks)) {
          const arr = tasksFor(dk);
          let changed = false;
          arr.forEach(t => {
            if (t.kind === "Build" && t.bigMoveId === removed.id) {
              t.bigMoveId = null;
              changed = true;
            }
          });
          if (changed) setTasksFor(dk, arr);
        }

        renderBigMoves();
        rebuildBigMoveSelect();
        buildCalendar(S.year);
      });

      buttons.appendChild(del);

      row.appendChild(check);
      row.appendChild(mid);
      row.appendChild(buttons);
      el.bigMovesList.appendChild(row);
    });
  };

  const rebuildBigMoveSelect = () => {
    el.bigMoveSelect.innerHTML = "";
    const active = S.bigMoves.filter(b => !b.done);

    if (!active.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Add a Big Move first";
      el.bigMoveSelect.appendChild(opt);
      el.bigMoveSelect.disabled = true;
      return;
    }

    el.bigMoveSelect.disabled = false;
    active.forEach(bm => {
      const opt = document.createElement("option");
      opt.value = bm.id;
      opt.textContent = bm.text;
      el.bigMoveSelect.appendChild(opt);
    });
  };

  const closeDayPopupNow = () => {
    el.dayPopup.style.display = "none";
    el.dayPopupTitle.textContent = "";
    el.dayPopupList.innerHTML = "";
    el.dayPopupNotes.textContent = "";
  };

  const openDayPopup = (dk) => {
    el.dayPopupTitle.textContent = formatDateKey(dk) || `Day ${dk}`;
    el.dayPopupList.innerHTML = "";

    const arr = tasksFor(dk);
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.className = "popup-item";
      empty.textContent = "No scheduled items for this day.";
      el.dayPopupList.appendChild(empty);
    } else {
      arr.forEach(t => {
        const item = document.createElement("div");
        item.className = "popup-item" + (t.done ? " done" : "");
        const prefix = t.kind === "Focus" ? "B:" : "D:";
        let extra = "";
        if (t.kind === "Build" && t.bigMoveId) {
          const bm = findBigMove(t.bigMoveId);
          if (bm) extra = ` (→ ${bm.text})`;
        }
        item.textContent = `${prefix} ${t.text}${extra}`;
        el.dayPopupList.appendChild(item);
      });
    }

    el.dayPopupNotes.textContent = S.notes[dk] || "—";
    el.dayPopup.style.display = "block";
  };

  const cancelSchedulingMode = () => {
    S.scheduling = null;
    el.scheduleOverlay.style.display = "none";
    el.scheduleOverlayText.textContent = "";
    buildCalendar(S.year);
  };

  const setSchedulingModeForTask = (taskObj) => {
    S.scheduling = taskObj;
    const kindLabel = taskObj.kind === "Build" ? "Build session" : "Task";
    el.scheduleOverlayText.innerHTML = `Scheduling <strong>${kindLabel}</strong>: <strong>${esc(taskObj.text)}</strong>`;
    el.scheduleOverlay.style.display = "block";
    closeDayPopupNow();

    if (!document.fullscreenElement) {
      el.calendarWrapper.requestFullscreen?.() || el.calendarWrapper.webkitRequestFullscreen?.();
    } else {
      buildCalendar(S.year);
    }
  };

  const placePendingTaskOnDay = (dk) => {
    if (!S.scheduling) return;
    const arr = tasksFor(dk);
    arr.push({
      id: makeId(),
      text: S.scheduling.text,
      done: false,
      kind: S.scheduling.kind,
      bigMoveId: S.scheduling.bigMoveId || null
    });
    setTasksFor(dk, arr);
    cancelSchedulingMode();
    buildCalendar(S.year);
  };

  const buildScheduledLines = (dk) => {
    const lines = document.createElement("div");
    lines.className = "scheduled-lines";

    const arr = tasksFor(dk);
    if (!arr.length) return lines;

    const sorted = [...arr].sort((a,b) => (a.kind === S.mode ? 0 : 1) - (b.kind === S.mode ? 0 : 1));
    const max = 3;

    const isFullscreen = document.body.classList.contains("fullscreen");

    sorted.slice(0, max).forEach(t => {
      const line = document.createElement("div");
      line.className = "scheduled-line" + (t.done ? " done" : "");

      if (isFullscreen) {
        // Fullscreen: no B:/D: prefixes
        line.textContent = t.text;
      } else {
        // Normal: keep B:/D:
        const prefix = t.kind === "Focus" ? "B:" : "D:";
        line.textContent = `${prefix} ${t.text}`;
      }

      lines.appendChild(line);
    });

    if (sorted.length > max) {
      const more = document.createElement("div");
      more.className = "scheduled-line";
      more.textContent = `+${sorted.length - max} more`;
      lines.appendChild(more);
    }

    return lines;
  };

  const buildCalendar = (year) => {
    el.calendar.innerHTML = "";
    const tbody = document.createElement("tbody");

    el.scheduleOverlay.style.display = S.scheduling ? "block" : "none";

    for (let m = 0; m < 12; m++) {
      const row = document.createElement("tr");

      const monthCell = document.createElement("td");
      monthCell.className = "month-name";
      monthCell.textContent = monthNames[m];
      row.appendChild(monthCell);

      const dim = new Date(year, m + 1, 0).getDate();

      for (let d = 1; d <= 31; d++) {
        const td = document.createElement("td");

        if (d <= dim) {
          const dateObj = new Date(year, m, d);
          const weekday = weekdayNames[dateObj.getDay()];
          const dk = `${m}-${d}`;

          const wrapper = document.createElement("div");
          wrapper.className = "cell-wrapper";

          const label = document.createElement("div");
          label.className = "day-label";
          label.textContent = `${d} ${weekday}`;

          const scheduled = buildScheduledLines(dk);

          const notes = document.createElement("div");
          notes.className = "day-notes";
          notes.contentEditable = "true";
          notes.dataset.key = dk;
          if (S.notes[dk]) notes.textContent = S.notes[dk];

          notes.addEventListener("input", () => {
            S.notes[dk] = notes.textContent;
            save(key.notes(S.year), S.notes);
            writeDailyLocalSnapshot();
          });

          td.addEventListener("click", (e) => {
            if (S.scheduling) {
              e.preventDefault();
              e.stopPropagation();
              placePendingTaskOnDay(dk);
              return;
            }
            openDayPopup(dk);
          }, true);

          wrapper.appendChild(label);
          wrapper.appendChild(scheduled);
          wrapper.appendChild(notes);

          td.appendChild(wrapper);

          if (weekday === "SAT" || weekday === "SUN") td.classList.add("weekend");
        } else {
          td.classList.add("empty");
        }

        row.appendChild(td);
      }

      tbody.appendChild(row);
    }

    el.calendar.appendChild(tbody);
  };

  const exportAllData = () => {
    const data = buildAllDataObject();
    downloadJson(data, `my-year-data-${yyyyMmDdLocal()}.json`);
  };

  const importDataFromFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || typeof parsed !== "object") return alert("Invalid data format.");

        const mode = parsed.mode || {};
        const cal = parsed.calendarNotes || {};
        const bm = parsed.bigMoves || {};
        const dt = parsed.dayTasks || {};

        Object.keys(mode).forEach(y => save(key.mode(y), mode[y] === "Build" ? "Build" : "Focus"));
        Object.keys(cal).forEach(y => save(key.notes(y), cal[y] || {}));
        Object.keys(bm).forEach(y => save(key.bigMoves(y), normalizeBigMoves(bm[y])));
        Object.keys(dt).forEach(y => save(key.dayTasks(y), normalizeDayTasks(dt[y])));

        if (S.year != null) setYear(S.year);
        writeDailyLocalSnapshot();
        alert("Data imported successfully.");
      } catch {
        alert("Failed to import data. Check that you selected a valid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  function setYear(value){
    const y = Number.parseInt(value, 10);
    if (!Number.isFinite(y) || y < 1 || y > 9999){
      el.yearInput.value = "";
      return;
    }

    S.year = y;
    el.yearInput.value = y;

    const params = new URLSearchParams(window.location.search);
    params.set("year", String(y));
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    S.mode = load(key.mode(y), "Focus") === "Build" ? "Build" : "Focus";
    S.notes = load(key.notes(y), {});
    S.bigMoves = normalizeBigMoves(load(key.bigMoves(y), []));
    S.dayTasks = normalizeDayTasks(load(key.dayTasks(y), {}));

    save(key.bigMoves(y), S.bigMoves);
    save(key.dayTasks(y), S.dayTasks);

    S.selectedDayKey = todayDateKeyForYear(y);

    buildDayPicker(y);
    renderSelectedDayTasks();
    renderBigMoves();
    rebuildBigMoveSelect();

    setMode(S.mode);
    buildCalendar(y);

    syncAddButtons();

    writeDailyLocalSnapshot();
    maybePromptDailyDownload();
  }

  const getInitialYear = () => {
    const p = new URLSearchParams(window.location.search);
    const y = Number.parseInt(p.get("year"), 10);
    return Number.isFinite(y) ? y : new Date().getFullYear();
  };

  // events
  el.modeFocusBtn.addEventListener("click", () => setMode("Focus"));
  el.modeBuildBtn.addEventListener("click", () => setMode("Build"));

  el.dayPicker.addEventListener("change", () => {
    S.selectedDayKey = el.dayPicker.value;
    renderSelectedDayTasks();
  });

  el.openCalendarToDayBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      el.calendarWrapper.requestFullscreen?.() || el.calendarWrapper.webkitRequestFullscreen?.();
    } else {
      buildCalendar(S.year);
    }
  });

  el.newDayTaskInput.addEventListener("input", syncAddButtons);
  el.newBigMoveInput.addEventListener("input", syncAddButtons);

  el.newDayTaskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      el.addDayTaskBtn.click();
    }
  });

  el.newBigMoveInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      el.addBigMoveBtn.click();
    }
  });

  el.addDayTaskBtn.addEventListener("click", () => {
    const t = el.newDayTaskInput.value.trim();
    if (!t) return;
    const dk = S.selectedDayKey || todayDateKeyForYear(S.year);
    const arr = tasksFor(dk);
    arr.push({ id: makeId(), text: t, done: false, kind: "Focus", bigMoveId: null });
    setTasksFor(dk, arr);
    el.newDayTaskInput.value = "";
    syncAddButtons();
    renderSelectedDayTasks();
    buildCalendar(S.year);
  });

  el.addBigMoveBtn.addEventListener("click", () => {
    const t = el.newBigMoveInput.value.trim();
    if (!t) return;
    S.bigMoves.push({ id: makeId(), text: t, done: false });
    save(key.bigMoves(S.year), S.bigMoves);
    writeDailyLocalSnapshot();
    el.newBigMoveInput.value = "";
    syncAddButtons();
    renderBigMoves();
    rebuildBigMoveSelect();
  });

  el.scheduleBuildSessionBtn.addEventListener("click", () => {
    const bmId = el.bigMoveSelect.value;
    if (!bmId) return alert("Add a Big Move first.");
    const bm = findBigMove(bmId);
    const custom = el.newBuildSessionInput.value.trim();
    const text = custom || `Deep work: ${bm ? bm.text : "Big Move"}`;
    setSchedulingModeForTask({ kind: "Build", text, bigMoveId: bmId });
    el.newBuildSessionInput.value = "";
  });

  el.cancelScheduleButton.addEventListener("click", cancelSchedulingMode);
  el.closeDayPopup.addEventListener("click", closeDayPopupNow);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.scheduling) cancelSchedulingMode();
    if (e.key === "Escape" && el.dayPopup.style.display === "block") closeDayPopupNow();
  });

  el.exportButton.addEventListener("click", exportAllData);
  el.importButton.addEventListener("click", () => el.importFileInput.click());
  el.importFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importDataFromFile(file);
    el.importFileInput.value = "";
  });

  el.openFullscreenButton.addEventListener("click", () => {
    closeDayPopupNow();
    if (!document.fullscreenElement) {
      el.calendarWrapper.requestFullscreen?.() || el.calendarWrapper.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      document.body.classList.add("fullscreen");
      buildCalendar(S.year);
    } else {
      document.body.classList.remove("fullscreen");
      closeDayPopupNow();
      if (S.scheduling) cancelSchedulingMode();
    }
  });

  el.yearInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      setYear(el.yearInput.value);
    }
  });

  el.yearInput.addEventListener("blur", () => {
    if (el.yearInput.value !== "") setYear(el.yearInput.value);
  });

  // boot
  setYear(getInitialYear());
  tryRestoreFromDailySnapshotIfEmpty();
})();
