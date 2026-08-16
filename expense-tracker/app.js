/* ============================================================
   EXPENSE TRACKER  -  app.js
   ============================================================

   All behaviour. Roughly the same jobs your Python version had:

       store.py   ->  the DB section below
       main.py    ->  the RENDER and EVENTS sections
       speech.py  ->  step 3 (not yet)

   HOW DATA IS STORED
   ------------------
   localStorage. It holds strings, so objects go in as JSON.

   Why not a real database? localStorage gives ~5-10MB, which
   is thousands of expenses. IndexedDB is the "proper" answer
   and is roughly ten times the code. Start simple; if you ever
   outgrow it, only this section changes.

   Everything is on the phone. Nothing is uploaded anywhere.
   ============================================================ */

"use strict";


/* ------------------------------------------------------------
   DEFAULTS
   ------------------------------------------------------------ */

const DEFAULT_CATEGORIES = [
  { name: "Food",          colour: "#F2784B", builtin: true },
  { name: "Groceries",     colour: "#4CAF7D", builtin: true },
  { name: "Transport",     colour: "#4A9DE0", builtin: true },
  { name: "Utilities",     colour: "#B07CD6", builtin: true },
  { name: "Housing",       colour: "#E0B54A", builtin: true },
  { name: "Health",        colour: "#E05A72", builtin: true },
  { name: "Shopping",      colour: "#4FC3C7", builtin: true },
  { name: "Entertainment", colour: "#9C7BE0", builtin: true },
  { name: "Education",     colour: "#5FA8D3", builtin: true },
  { name: "Other",         colour: "#8B98A5", builtin: true }
];

const PAYMENTS = ["Cash", "Card", "Bank", "Wallet", "Other"];

const PALETTE = [
  "#F2784B", "#4CAF7D", "#4A9DE0", "#B07CD6", "#E0B54A",
  "#E05A72", "#4FC3C7", "#9C7BE0", "#5FA8D3", "#8B98A5"
];

const KEY_EXPENSES = "expenses.v1";
const KEY_CATEGORIES = "categories.v1";


/* ------------------------------------------------------------
   DB  -  read and write localStorage
   ------------------------------------------------------------ */

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    // Corrupted data should not brick the app on launch.
    console.warn("Could not read", key, err);
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getExpenses()  { return load(KEY_EXPENSES, []); }
function setExpenses(v) { save(KEY_EXPENSES, v); }

function getCategories() {
  return load(KEY_CATEGORIES, DEFAULT_CATEGORIES);
}

function setCategories(v) { save(KEY_CATEGORIES, v); }

function colourFor(name) {
  const found = getCategories().find(c => c.name === name);
  return found ? found.colour : "#8B98A5";
}

function nextId(all) {
  // Date.now() ALONE IS NOT SAFE.
  //
  // It has millisecond resolution, so two expenses created in
  // the same millisecond get the same id - and then deleting
  // one would delete both. That is not theoretical: pressing
  // Duplicate saves a record immediately after reading one.
  //
  // Taking one more than the highest existing id guarantees
  // uniqueness no matter how fast records are created.
  const highest = all.reduce((max, e) => Math.max(max, e.id || 0), 0);
  return Math.max(Date.now(), highest + 1);
}

function addExpense(record) {
  const all = getExpenses();

  record.id = nextId(all);
  record.createdAt = new Date().toISOString();

  all.push(record);
  setExpenses(all);

  return record.id;
}

function deleteExpense(id) {
  setExpenses(getExpenses().filter(e => e.id !== id));
}

function duplicateExpense(id) {
  const original = getExpenses().find(e => e.id === id);
  if (!original) return;

  addExpense({
    amount: original.amount,
    category: original.category,
    payment: original.payment,
    note: original.note,
    date: todayISO()
  });
}


/* ------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------ */

function todayISO() {
  // Local date, not UTC. new Date().toISOString() would roll
  // over at midnight UTC and file evening expenses under
  // tomorrow for anyone east of London.
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthOf(iso) { return iso.slice(0, 7); }

function money(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function prettyDate(iso) {
  const today = todayISO();
  if (iso === today) return "Today";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const pad = n => String(n).padStart(2, "0");
  const y = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

  if (iso === y) return "Yesterday";

  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Shorthand for document.getElementById
const $ = id => document.getElementById(id);


/* ------------------------------------------------------------
   STATE  -  what is currently selected
   ------------------------------------------------------------ */

const state = {
  category: "Food",
  payment: "Cash",
  month: monthOf(todayISO()),
  search: "",
  newCatColour: PALETTE[0]
};


/* ------------------------------------------------------------
   RENDER
   ------------------------------------------------------------ */

function renderChips() {
  // Categories, most-used first, so the chips reflect real
  // habits instead of a fixed alphabetical list.
  const counts = {};
  getExpenses().forEach(e => {
    counts[e.category] = (counts[e.category] || 0) + 1;
  });

  const ordered = getCategories().slice().sort(
    (a, b) => (counts[b.name] || 0) - (counts[a.name] || 0)
  );

  const box = $("categoryChips");
  box.innerHTML = "";

  ordered.forEach(cat => {
    const chip = document.createElement("button");
    chip.className = "chip" + (cat.name === state.category ? " selected" : "");
    chip.textContent = cat.name;

    if (cat.name === state.category) {
      chip.style.background = cat.colour;
    }

    chip.onclick = () => { state.category = cat.name; renderChips(); };
    box.appendChild(chip);

    // Keep the selected chip visible. The strip scrolls, and
    // re-ordering by usage can push your current choice off
    // screen — leaving no visible indication of what is
    // selected, which is worse than no ordering at all.
    if (cat.name === state.category) {
      requestAnimationFrame(() => {
        chip.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    }
  });

  const pay = $("paymentChips");
  pay.innerHTML = "";

  PAYMENTS.forEach(name => {
    const chip = document.createElement("button");
    chip.className = "chip" + (name === state.payment ? " selected" : "");
    chip.textContent = name;

    if (name === state.payment) {
      chip.style.background = "#4A9DE0";
    }

    chip.onclick = () => { state.payment = name; renderChips(); };
    pay.appendChild(chip);
  });
}


function renderTotals() {
  const all = getExpenses();
  const today = todayISO();

  const todayRows = all.filter(e => e.date === today);
  const todayTotal = todayRows.reduce((sum, e) => sum + e.amount, 0);

  $("todayAmount").textContent = "Rs " + money(todayTotal);
  $("todayCount").textContent =
    todayRows.length === 0 ? "no expenses yet"
    : todayRows.length + (todayRows.length === 1 ? " expense" : " expenses");

  const monthTotal = all
    .filter(e => monthOf(e.date) === state.month)
    .reduce((sum, e) => sum + e.amount, 0);

  $("monthAmount").textContent = "Rs " + money(monthTotal);
}


function renderMonthFilter() {
  const months = [...new Set(getExpenses().map(e => monthOf(e.date)))];

  if (!months.includes(state.month)) months.push(state.month);
  months.sort().reverse();

  const select = $("monthFilter");
  select.innerHTML = "";

  months.forEach(m => {
    const option = document.createElement("option");
    option.value = m;
    option.textContent = m;
    if (m === state.month) option.selected = true;
    select.appendChild(option);
  });
}


function renderList() {
  const term = state.search.toLowerCase();

  const rows = getExpenses()
    .filter(e => monthOf(e.date) === state.month)
    .filter(e => !term ||
                 (e.note || "").toLowerCase().includes(term) ||
                 e.category.toLowerCase().includes(term))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const list = $("expenseList");
  list.innerHTML = "";

  if (rows.length === 0) {
    list.innerHTML = '<div class="empty">Nothing here yet.</div>';
    return;
  }

  rows.forEach(e => {
    const row = document.createElement("div");
    row.className = "expense";

    row.innerHTML = `
      <div class="expense-bar" style="background:${colourFor(e.category)}"></div>
      <div class="expense-main">
        <div class="expense-title"></div>
        <div class="expense-meta"></div>
      </div>
      <div class="expense-amount">${money(e.amount)}</div>
      <button class="expense-menu">&#8942;</button>
    `;

    // Set user text with textContent, never innerHTML. If a note
    // contained <script> or stray HTML, innerHTML would render
    // it. textContent always treats it as plain text.
    row.querySelector(".expense-title").textContent =
      e.note || e.category;

    row.querySelector(".expense-meta").textContent =
      `${e.category} · ${e.payment} · ${prettyDate(e.date)}`;

    row.querySelector(".expense-menu").onclick = () => rowMenu(e);

    list.appendChild(row);
  });
}


function renderBreakdown() {
  const totals = {};

  getExpenses()
    .filter(e => monthOf(e.date) === state.month)
    .forEach(e => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });

  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const box = $("breakdown");
  box.innerHTML = "";

  if (rows.length === 0) {
    box.innerHTML = '<div class="empty">No spending this month.</div>';
    return;
  }

  const biggest = rows[0][1];

  rows.forEach(([name, value]) => {
    const div = document.createElement("div");
    div.className = "bd-row";

    div.innerHTML = `
      <div class="bd-top">
        <span class="bd-name"></span>
        <span class="bd-value">${money(value)}</span>
      </div>
      <div class="bd-track">
        <div class="bd-fill" style="width:${(value / biggest) * 100}%;
             background:${colourFor(name)}"></div>
      </div>
    `;

    div.querySelector(".bd-name").textContent = name;
    box.appendChild(div);
  });
}


function renderAll() {
  renderChips();
  renderTotals();
  renderMonthFilter();
  renderList();
  renderBreakdown();
}


/* ------------------------------------------------------------
   ACTIONS
   ------------------------------------------------------------ */

function setStatus(text, colour) {
  const el = $("status");
  el.textContent = text;
  el.style.color = colour || "var(--muted)";
}


function doSave() {
  const raw = $("amount").value.trim().replace(/,/g, "");

  if (!raw) {
    setStatus("Enter an amount.", "var(--warn)");
    $("amount").focus();
    return;
  }

  const amount = parseFloat(raw);

  if (isNaN(amount) || amount <= 0) {
    setStatus("That is not a valid amount.", "var(--danger)");
    return;
  }

  addExpense({
    amount: amount,
    category: state.category,
    payment: state.payment,
    note: $("note").value.trim(),
    date: $("date").value || todayISO()
  });

  $("amount").value = "";
  $("note").value = "";

  state.month = monthOf($("date").value || todayISO());

  renderAll();
  setStatus(`Added Rs ${money(amount)} · ${state.category}`, "var(--good)");

  // A short buzz confirms the save without needing to look.
  if (navigator.vibrate) navigator.vibrate(15);
}


function rowMenu(expense) {
  const choice = prompt(
    `${expense.note || expense.category} — Rs ${money(expense.amount)}\n\n` +
    "1 = Duplicate to today\n" +
    "2 = Delete\n\n" +
    "Enter 1 or 2 (or Cancel)"
  );

  if (choice === "1") {
    duplicateExpense(expense.id);
    renderAll();
    setStatus("Duplicated to today.", "var(--good)");
  } else if (choice === "2") {
    deleteExpense(expense.id);
    renderAll();
    setStatus("Deleted.", "var(--muted)");
  }
}


/* ---- category manager ---- */

function renderColours() {
  const box = $("colourPicker");
  box.innerHTML = "";

  PALETTE.forEach(colour => {
    const dot = document.createElement("button");
    dot.className = "swatch" + (colour === state.newCatColour ? " selected" : "");
    dot.style.background = colour;
    dot.onclick = () => { state.newCatColour = colour; renderColours(); };
    box.appendChild(dot);
  });
}


function renderCatList() {
  const box = $("catList");
  box.innerHTML = "";

  getCategories().forEach(cat => {
    const row = document.createElement("div");
    row.className = "cat-row";

    row.innerHTML = `
      <div class="cat-dot" style="background:${cat.colour}"></div>
      <div class="cat-name"></div>
    `;

    row.querySelector(".cat-name").textContent = cat.name;

    if (cat.builtin) {
      const tag = document.createElement("span");
      tag.className = "cat-tag";
      tag.textContent = "built-in";
      row.appendChild(tag);
    } else {
      const del = document.createElement("button");
      del.className = "cat-del";
      del.textContent = "Delete";
      del.onclick = () => removeCategory(cat.name);
      row.appendChild(del);
    }

    box.appendChild(row);
  });
}


function addCategory() {
  const name = $("newCatName").value.trim();
  const message = $("catMessage");

  if (!name) {
    message.textContent = "Give it a name.";
    return;
  }

  const cats = getCategories();

  if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    message.textContent = `'${name}' already exists.`;
    return;
  }

  cats.push({ name: name, colour: state.newCatColour, builtin: false });
  setCategories(cats);

  $("newCatName").value = "";
  message.textContent = `Added '${name}'.`;

  renderCatList();
  renderChips();
}


function removeCategory(name) {
  // Expenses in this category move to Other rather than being
  // deleted. Losing spending history to a tidy-up would be
  // indefensible.
  const moved = getExpenses().filter(e => e.category === name).length;

  setExpenses(getExpenses().map(e =>
    e.category === name ? { ...e, category: "Other" } : e
  ));

  setCategories(getCategories().filter(c => c.name !== name));

  if (state.category === name) state.category = "Other";

  $("catMessage").textContent = moved
    ? `Deleted '${name}'. ${moved} expense(s) moved to Other.`
    : `Deleted '${name}'.`;

  renderCatList();
  renderAll();
}


/* ------------------------------------------------------------
   EVENTS
   ------------------------------------------------------------ */

function wireUp() {
  $("saveBtn").onclick = doSave;

  $("todayBtn").onclick = () => { $("date").value = todayISO(); };

  $("amount").addEventListener("keydown", e => {
    if (e.key === "Enter") doSave();
  });

  $("note").addEventListener("keydown", e => {
    if (e.key === "Enter") doSave();
  });

  $("search").addEventListener("input", e => {
    state.search = e.target.value;
    renderList();
  });

  $("monthFilter").addEventListener("change", e => {
    state.month = e.target.value;
    renderAll();
  });

  $("manageCats").onclick = () => {
    $("catSheet").classList.remove("hidden");
    $("catMessage").textContent = "";
    renderColours();
    renderCatList();
  };

  $("closeCats").onclick = () => $("catSheet").classList.add("hidden");

  $("catSheet").onclick = e => {
    // Tapping the dark backdrop closes the sheet, but tapping
    // inside the white panel must not.
    if (e.target.id === "catSheet") $("catSheet").classList.add("hidden");
  };

  $("addCatBtn").onclick = addCategory;

  $("voiceBtn").onclick = toggleVoice;

  $("csvBtn").onclick = exportCSV;

  $("exportBtn").onclick = exportData;

  $("importBtn").onclick = () => $("importFile").click();

  $("importFile").addEventListener("change", event => {
    const file = event.target.files[0];
    if (file) importData(file);
    event.target.value = "";        // allow re-picking the same file
  });
}


/* ------------------------------------------------------------
   VOICE
   ------------------------------------------------------------ */

let voice = null;

function setupVoice() {
  voice = new VoiceInput({

    onPartial: text => {
      $("voiceHeard").textContent = "… " + text;
    },

    onFinal: (text, parsed) => {
      $("voiceHeard").textContent = "Heard: " + text;
      applyParsed(parsed);
    },

    onError: message => {
      $("voiceHeard").textContent = message;
      stopVoice();
    },

    onEnd: () => stopVoice()
  });

  if (!voice.supported) {
    $("voiceBtn").classList.add("hidden");
    console.log("This browser has no speech recognition.");
  }
}


function applyParsed(parsed) {
  if (parsed.amount !== null) $("amount").value = parsed.amount;

  if (parsed.payment) {
    state.payment = parsed.payment;
  }

  if (parsed.category) {
    // Only select a category that actually exists, otherwise
    // the chip row would show a selection you cannot re-pick.
    const known = getCategories().some(c => c.name === parsed.category);
    state.category = known ? parsed.category : "Other";
  }

  if (parsed.description) $("note").value = parsed.description;

  renderChips();
}


function startVoice() {
  if (!voice || !voice.supported) return;

  $("voiceHeard").textContent = "";

  if (voice.start()) {
    $("voiceBtn").classList.add("listening");
    $("voiceLabel").textContent = "Listening…";
    setStatus('Try "1500 on dinner by card"', "var(--accent)");
  }
}


function stopVoice() {
  if (voice) voice.stop();

  $("voiceBtn").classList.remove("listening");
  $("voiceLabel").textContent = "Speak";
}


function toggleVoice() {
  if (voice && voice.listening) stopVoice();
  else startVoice();
}


/* ------------------------------------------------------------
   BACKUP  -  export and import
   ------------------------------------------------------------

   WHY THIS MATTERS MORE THAN IT LOOKS

   localStorage is scoped to the ORIGIN. Data saved on
   file:///D:/... is invisible from http://localhost:8000,
   which is invisible from https://yoursite.netlify.app.

   Same app, same browser, three separate boxes.

   So moving the app to a real URL - which is exactly what
   deploying does - looks like losing everything. Export before
   you move, import after. This is also your only backup if the
   phone is lost, since nothing is stored anywhere else.
*/

/*
   DELIVERING A FILE FROM A WEB APP

   A web app cannot choose where a file is saved. There is no
   API for "put this in D:\Reports" - browsers deliberately
   forbid it, or any web page could write anywhere on your disk.
   Downloads go wherever the browser is configured to put them,
   which on Android is always the Downloads folder.

   On a phone the share sheet is better than a folder anyway:
   it hands the file straight to Drive, WhatsApp, email or
   anything else installed. So try that first, and fall back to
   a plain download on desktop.
*/
async function deliverFile(filename, text, mime) {

  const file = new File([text], filename, { type: mime });

  // Phone: offer the share sheet
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (err) {
      // User dismissed the sheet - fall through and download
      if (err.name === "AbortError") return "cancelled";
    }
  }

  // Desktop, or share unavailable: download it
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  return "downloaded";
}


function entryTime(expense) {
  // When the expense was RECORDED, as HH:MM.
  //
  // 24-hour on purpose: a spreadsheet sorts "09:30" and "21:15"
  // correctly as text, whereas "9:30 PM" sorts before "9:30 AM".

  let when = expense.createdAt ? new Date(expense.createdAt) : null;

  // FALLBACK: the id IS a timestamp.
  //
  // Ids are generated from Date.now(), so even a record saved
  // before createdAt existed - or one restored from an old
  // backup - still carries its creation time inside its id.
  // Nothing has to be guessed or left blank.
  if (!when || isNaN(when.getTime())) {
    const id = Number(expense.id);

    // Sanity-check it looks like a real timestamp rather than a
    // small counter: 1e12 ms is the year 2001.
    if (id > 1e12) when = new Date(id);
  }

  if (!when || isNaN(when.getTime())) return "";

  const pad = n => String(n).padStart(2, "0");

  return `${pad(when.getHours())}:${pad(when.getMinutes())}`;
}


function csvCell(value) {
  const text = String(value ?? "");

  // A note containing a comma, a quote or a newline would break
  // the columns. The CSV rule is: wrap in quotes and double any
  // quote inside.
  return /[",\n\r]/.test(text)
    ? '"' + text.replace(/"/g, '""') + '"'
    : text;
}


async function exportCSV() {
  const rows = getExpenses()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  if (!rows.length) {
    setStatus("Nothing to export yet.", "var(--warn)");
    return;
  }

  const lines = [
    ["Date", "Time", "Amount", "Category", "Payment", "Note"].join(",")
  ];

  rows.forEach(e => {
    lines.push([
      csvCell(e.date),
      csvCell(entryTime(e)),
      csvCell(e.amount),
      csvCell(e.category),
      csvCell(e.payment),
      csvCell(e.note)
    ].join(","));
  });

  const total = rows.reduce((sum, e) => sum + e.amount, 0);

  lines.push("");
  lines.push(["", "", total, "TOTAL", "", ""].join(","));

  // The BOM matters. Without it Excel opens UTF-8 as Windows-1252
  // and mangles any non-English text in your notes.
  const csv = "\uFEFF" + lines.join("\r\n");

  const result = await deliverFile(
    `expenses-${todayISO()}.csv`, csv, "text/csv"
  );

  if (result === "cancelled") return;

  setStatus(
    result === "shared"
      ? `Shared ${rows.length} expenses.`
      : `Saved expenses-${todayISO()}.csv to Downloads.`,
    "var(--good)"
  );
}


async function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    expenses: getExpenses(),
    categories: getCategories()
  };

  const result = await deliverFile(
    `expenses-backup-${todayISO()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );

  if (result === "cancelled") return;

  setStatus(`Backed up ${payload.expenses.length} expenses.`, "var(--good)");
}


function importData(file) {
  const reader = new FileReader();

  reader.onload = () => {
    let data;

    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      setStatus("That file is not a valid backup.", "var(--danger)");
      return;
    }

    if (!Array.isArray(data.expenses)) {
      setStatus("No expenses found in that file.", "var(--danger)");
      return;
    }

    // MERGE, never replace. Importing onto a device that already
    // has expenses must not wipe them - that would turn a
    // mistaken tap into permanent data loss. Ids already present
    // are skipped, so importing the same file twice is safe.
    const existing = getExpenses();
    const seen = new Set(existing.map(e => e.id));

    const incoming = data.expenses.filter(e => !seen.has(e.id));

    setExpenses(existing.concat(incoming));

    if (Array.isArray(data.categories)) {
      const names = new Set(getCategories().map(c => c.name));
      const extra = data.categories.filter(c => !names.has(c.name));
      if (extra.length) setCategories(getCategories().concat(extra));
    }

    renderAll();

    const skipped = data.expenses.length - incoming.length;

    setStatus(
      `Imported ${incoming.length} expense(s)` +
      (skipped ? `, skipped ${skipped} already here.` : "."),
      "var(--good)"
    );
  };

  reader.readAsText(file);
}


/* ------------------------------------------------------------
   PWA  -  service worker and install prompt
   ------------------------------------------------------------ */

function registerServiceWorker() {

  if (!("serviceWorker" in navigator)) {
    console.log("This browser has no service worker support.");
    return;
  }

  // IMPORTANT: service workers are blocked on file:// URLs.
  // Opening index.html by double-clicking will NOT register
  // one. It needs http://localhost or https://
  if (location.protocol === "file:") {
    console.warn(
      "Opened as a file:// URL, so offline support is off.\n" +
      "Serve it instead:  python -m http.server 8000\n" +
      "then visit http://localhost:8000"
    );
    return;
  }

  navigator.serviceWorker.register("./sw.js")
    .then(() => console.log("Service worker registered - offline ready."))
    .catch(err => console.warn("Service worker failed:", err));
}


let installPrompt = null;

function setupInstall() {

  // Chrome fires this instead of showing its own bar, letting
  // us put the invitation somewhere sensible.
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    $("installBtn").classList.remove("hidden");
  });

  $("installBtn").onclick = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice;

    installPrompt = null;
    $("installBtn").classList.add("hidden");
  };

  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (installed) {
    $("installBtn").classList.add("hidden");
    return;
  }

  // iOS never fires beforeinstallprompt - Safari has no install
  // API at all. Without a hint an iPhone user simply sees a web
  // page and never discovers they can install it, so tell them
  // where the button is.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    $("iosHint").classList.remove("hidden");
  }
}


/* ------------------------------------------------------------
   START
   ------------------------------------------------------------ */

function init() {
  $("date").value = todayISO();
  wireUp();
  setupVoice();
  renderAll();
  setupInstall();
  registerServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
