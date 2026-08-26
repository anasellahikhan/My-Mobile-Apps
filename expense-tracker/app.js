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
const KEY_INCOME = "income.v1";
const KEY_CURRENCY = "currency.v1";

/* ------------------------------------------------------------
   CURRENCY

   Each record stores the currency it was entered in, and totals
   are grouped by currency rather than summed together.

   Why not just swap the symbol? Because 500 PKR + 500 USD is
   not 1,000 of anything. Someone who records in both would get
   a confidently wrong total.

   And why no conversion? Rates move daily and this app works
   offline. A stale rate produces a number that looks precise
   and is wrong - worse than showing two honest figures.
------------------------------------------------------------ */

const CURRENCIES = {
  PKR: { symbol: "Rs", label: "PKR" },
  USD: { symbol: "$",  label: "USD" }
};

const DEFAULT_CURRENCY = "PKR";

// Where monthly income comes from. Cash only for now, as asked.
const INCOME_SOURCES = ["Salary", "Business", "Rent", "Gift", "Other"];


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

function getCurrency() {
  const saved = load(KEY_CURRENCY, DEFAULT_CURRENCY);
  return CURRENCIES[saved] ? saved : DEFAULT_CURRENCY;
}

function setCurrency(code) {
  if (CURRENCIES[code]) save(KEY_CURRENCY, code);
}

function symbolFor(code) {
  return (CURRENCIES[code] || CURRENCIES[DEFAULT_CURRENCY]).symbol;
}

// One record's amount, with its own currency symbol
function amountWithCurrency(record) {
  return symbolFor(record.currency || DEFAULT_CURRENCY) +
         " " + money(record.amount);
}

/*
   Total a set of records, grouped by currency.

   Returns "Rs 45,000" when everything is one currency, and
   "Rs 45,000 · $120" when it is not. No fake conversion.
*/
function totalsByCurrency(records) {
  const totals = {};

  records.forEach(r => {
    const code = r.currency || DEFAULT_CURRENCY;
    totals[code] = (totals[code] || 0) + r.amount;
  });

  const codes = Object.keys(totals);

  if (!codes.length) return symbolFor(getCurrency()) + " 0";

  // Active currency first, so your own number leads
  codes.sort((a, b) =>
    a === getCurrency() ? -1 : b === getCurrency() ? 1 : a.localeCompare(b)
  );

  return codes
    .map(code => symbolFor(code) + " " + money(totals[code]))
    .join("  ·  ");
}


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

/* ---- income ---- */

function getIncome()  { return load(KEY_INCOME, []); }
function setIncome(v) { save(KEY_INCOME, v); }

function addIncome(record) {
  const all = getIncome();

  record.id = nextId(all);
  record.createdAt = new Date().toISOString();

  all.push(record);
  setIncome(all);

  return record.id;
}

function deleteIncome(id) {
  setIncome(getIncome().filter(e => e.id !== id));
}

/*
   Insights deliberately work in the ACTIVE currency only.

   "Safe to spend per day" mixing PKR and USD would be a number
   with no meaning. Records in the other currency are simply not
   counted here - switch the toggle to see those instead.
*/
function incomeForMonth(month) {
  const active = getCurrency();

  return getIncome()
    .filter(e => e.month === month)
    .filter(e => (e.currency || DEFAULT_CURRENCY) === active)
    .reduce((sum, e) => sum + e.amount, 0);
}

function expensesForMonth(month) {
  const active = getCurrency();

  return getExpenses()
    .filter(e => monthOf(e.date) === month)
    .filter(e => (e.currency || DEFAULT_CURRENCY) === active)
    .reduce((sum, e) => sum + e.amount, 0);
}


/* ------------------------------------------------------------
   DISPOSABLE INCOME
   ------------------------------------------------------------

   The whole point of adding income: not "what did I spend" but
   "what can I still spend".

   safePerDay is the number that actually changes behaviour. A
   month total is abstract; "Rs 1,240 a day for the next 9 days"
   is a decision you can make at a shop counter.
*/
function monthSummary(month) {
  const income = incomeForMonth(month);
  const spent = expensesForMonth(month);
  const left = income - spent;

  const today = new Date();
  const isCurrentMonth = month === monthOf(todayISO());

  // Days in this calendar month
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysLeft = isCurrentMonth
    ? Math.max(0, daysInMonth - dayOfMonth + 1)
    : 0;

  return {
    month,
    income,
    spent,
    left,
    daysInMonth,
    dayOfMonth,
    daysLeft,
    isCurrentMonth,
    // Guard against dividing by zero on the last day
    safePerDay: daysLeft > 0 ? left / daysLeft : left,
    spentPerDay: dayOfMonth > 0 ? spent / dayOfMonth : 0,
    usedPct: income > 0 ? (spent / income) * 100 : null
  };
}


function duplicateExpense(id) {
  const original = getExpenses().find(e => e.id === id);
  if (!original) return;

  addExpense({
    amount: original.amount,
    currency: original.currency || DEFAULT_CURRENCY,
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


function textOn(background) {
  // Pick black or white text for a coloured chip.
  //
  // A fixed choice fails somewhere: white on the yellow
  // Housing colour is unreadable, black on deep purple is
  // worse. Relative luminance decides per colour instead of
  // guessing once for all of them.
  //
  // Rather than pick a magic brightness cutoff - my first
  // attempt used 0.55 and put white text on a pale yellow chip -
  // work out the actual WCAG contrast ratio against black and
  // against white, and use whichever wins. No threshold to
  // guess, and it stays correct for any colour you add later.
  const hex = String(background).replace("#", "");

  if (hex.length !== 6) return "#FFFFFF";

  const [r, g, b] = [0, 2, 4].map(i =>
    parseInt(hex.slice(i, i + 2), 16) / 255
  );

  const channel = c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const luminance =
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  // Contrast ratio is (lighter + 0.05) / (darker + 0.05)
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / 0.05;

  return againstBlack > againstWhite ? "#101418" : "#FFFFFF";
}


/* ------------------------------------------------------------
   STATE  -  what is currently selected
   ------------------------------------------------------------ */

// How many rows a list shows before "Show more".
// Five keeps the capture form and today's total on screen
// without scrolling, which is the point of the whole layout.
const PREVIEW_ROWS = 5;

const state = {
  tab: "spend",
  expandedExpenses: false,
  expandedIncome: false,
  category: "Food",
  payment: "Cash",
  incomeSource: "Salary",
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
      chip.style.color = textOn(cat.colour);
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

  $("todayAmount").textContent = totalsByCurrency(todayRows);
  $("todayCount").textContent =
    todayRows.length === 0 ? "no expenses yet"
    : todayRows.length + (todayRows.length === 1 ? " expense" : " expenses");

  $("monthAmount").textContent = totalsByCurrency(
    all.filter(e => monthOf(e.date) === monthOf(todayISO()))
  );
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

  // The Spend tab is always the current month. Finished months
  // live in the archive cards below it.
  const thisMonth = monthOf(todayISO());

  const rows = getExpenses()
    .filter(e => monthOf(e.date) === thisMonth)
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

  const visible = state.expandedExpenses
    ? rows
    : rows.slice(0, PREVIEW_ROWS);

  visible.forEach(e => {
    const row = document.createElement("div");
    row.className = "expense";

    row.innerHTML = `
      <div class="expense-bar" style="background:${colourFor(e.category)}"></div>
      <div class="expense-main">
        <div class="expense-title"></div>
        <div class="expense-meta"></div>
      </div>
      <div class="expense-amount">${amountWithCurrency(e)}</div>
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

  addMoreButton(list, rows.length, state.expandedExpenses, () => {
    state.expandedExpenses = !state.expandedExpenses;
    renderList();
  });
}


/* ------------------------------------------------------------
   SHOW MORE
   ------------------------------------------------------------

   Shared by both lists so they behave identically. Collapsing
   scrolls the list back into view - otherwise tapping "Show
   less" on a long list leaves you stranded in empty space
   below the page.
*/
function addMoreButton(container, total, expanded, onToggle) {

  if (total <= PREVIEW_ROWS) return;

  const button = document.createElement("button");
  button.className = "more-btn";

  button.textContent = expanded
    ? "Show less"
    : `Show all ${total}  (${total - PREVIEW_ROWS} more)`;

  button.onclick = () => {
    const wasExpanded = expanded;

    onToggle();

    if (wasExpanded) {
      container.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  container.appendChild(button);
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


/* ------------------------------------------------------------
   INCOME + INSIGHTS RENDERING
   ------------------------------------------------------------ */

function renderIncomeChips() {
  const box = $("incomeSourceChips");
  box.innerHTML = "";

  INCOME_SOURCES.forEach(name => {
    const chip = document.createElement("button");
    chip.className = "chip" + (name === state.incomeSource ? " selected" : "");
    chip.textContent = name;

    if (name === state.incomeSource) chip.style.background = "#4CAF7D";

    chip.onclick = () => { state.incomeSource = name; renderIncomeChips(); };
    box.appendChild(chip);
  });
}


function renderIncomeList() {
  const rows = getIncome()
    .filter(e => e.month === state.month)
    .sort((a, b) => b.id - a.id);

  const list = $("incomeList");
  list.innerHTML = "";

  if (!rows.length) {
    list.innerHTML =
      '<div class="empty">No income recorded for this month.</div>';
    return;
  }

  const visible = state.expandedIncome
    ? rows
    : rows.slice(0, PREVIEW_ROWS);

  visible.forEach(e => {
    const row = document.createElement("div");
    row.className = "expense";

    row.innerHTML = `
      <div class="expense-bar" style="background:#4CAF7D"></div>
      <div class="expense-main">
        <div class="expense-title"></div>
        <div class="expense-meta"></div>
      </div>
      <div class="expense-amount income">+${amountWithCurrency(e)}</div>
      <button class="expense-menu">&#10005;</button>
    `;

    row.querySelector(".expense-title").textContent = e.source;
    row.querySelector(".expense-meta").textContent =
      e.note || `Cash · ${e.month}`;

    row.querySelector(".expense-menu").onclick = () => {
      deleteIncome(e.id);
      renderAll();
      setIncomeStatus("Income removed.", "var(--muted)");
    };

    list.appendChild(row);
  });

  addMoreButton(list, rows.length, state.expandedIncome, () => {
    state.expandedIncome = !state.expandedIncome;
    renderIncomeList();
  });
}


function renderInsights() {
  const s = monthSummary(state.month);
  const sym = symbolFor(getCurrency());

  $("insIncome").textContent = sym + " " + money(s.income);
  $("insSpent").textContent = sym + " " + money(s.spent);

  const leftEl = $("insLeft");
  leftEl.textContent = sym + " " + money(s.left);
  leftEl.style.color = s.left < 0 ? "var(--danger)" : "var(--good)";

  // progress bar of income used
  const bar = $("insBar");

  if (s.income > 0) {
    const pct = Math.min(100, (s.spent / s.income) * 100);
    bar.style.width = pct + "%";
    bar.style.background =
      pct > 100 ? "var(--danger)" :
      pct > 85  ? "var(--warn)" : "var(--good)";
    $("insBarLabel").textContent =
      `${Math.round((s.spent / s.income) * 100)}% of income spent`;
  } else {
    bar.style.width = "0%";
    $("insBarLabel").textContent = "Add your income to see this";
  }

  // the number that changes behaviour
  const safe = $("insSafe");

  if (s.income <= 0) {
    safe.textContent = "—";
    $("insSafeLabel").textContent = "Record this month's income first";
  } else if (!s.isCurrentMonth) {
    safe.textContent = "—";
    $("insSafeLabel").textContent = "Only shown for the current month";
  } else if (s.left < 0) {
    safe.textContent = sym + " " + money(Math.abs(s.left));
    safe.style.color = "var(--danger)";
    $("insSafeLabel").textContent = "over budget this month";
  } else {
    safe.textContent = sym + " " + money(Math.floor(s.safePerDay));
    safe.style.color = "var(--good)";
    $("insSafeLabel").textContent =
      `a day for the remaining ${s.daysLeft} day` +
      (s.daysLeft === 1 ? "" : "s");
  }

  // pace: are you spending faster than income allows
  const pace = $("insPace");

  if (s.income > 0 && s.isCurrentMonth && s.dayOfMonth > 0) {
    const projected = s.spentPerDay * s.daysInMonth;
    const over = projected - s.income;

    if (over > 0) {
      pace.textContent =
        `At this pace you will spend about ${sym} ${money(Math.round(projected))} ` +
        `this month — ${sym} ${money(Math.round(over))} more than you earned.`;
      pace.style.color = "var(--warn)";
    } else {
      pace.textContent =
        `At this pace you will spend about ${sym} ${money(Math.round(projected))} ` +
        `and save ${sym} ${money(Math.round(-over))}.`;
      pace.style.color = "var(--muted)";
    }
  } else {
    pace.textContent = "";
  }
}


/* ------------------------------------------------------------
   MONTH ARCHIVE
   ------------------------------------------------------------

   The Spend tab always shows the CURRENT month, five rows deep.
   Finished months become cards below it - tap one to read the
   whole month.

   Why not one long scrolling list: a year of spending is a
   thousand rows. Months are how people already think about
   money, so they are the natural unit to break it at.
*/

function monthLabel(month) {
  const [year, mon] = month.split("-").map(Number);

  return new Date(year, mon - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}


function monthsWithData() {
  const months = new Set(getExpenses().map(e => monthOf(e.date)));

  getIncome().forEach(e => months.add(e.month));

  return [...months].sort().reverse();
}


function renderMonthCards() {
  const current = monthOf(todayISO());
  const past = monthsWithData().filter(m => m !== current);

  const box = $("monthCards");
  box.innerHTML = "";

  $("archiveHead").classList.toggle("hidden", past.length === 0);

  past.forEach(month => {
    const rows = getExpenses().filter(e => monthOf(e.date) === month);
    const spent = rows.reduce((sum, e) => sum + e.amount, 0);
    const earned = incomeForMonth(month);

    const card = document.createElement("button");
    card.className = "month-card";

    card.innerHTML = `
      <div class="month-card-main">
        <div class="month-card-name"></div>
        <div class="month-card-meta"></div>
      </div>
      <div class="month-card-right">
        <div class="month-card-amount">${totalsByCurrency(rows)}</div>
        <div class="month-card-chev">&rsaquo;</div>
      </div>
    `;

    card.querySelector(".month-card-name").textContent = monthLabel(month);

    card.querySelector(".month-card-meta").textContent =
      `${rows.length} expense${rows.length === 1 ? "" : "s"}`;

    card.onclick = () => openMonth(month);

    box.appendChild(card);
  });
}


function openMonth(month) {
  const rows = getExpenses()
    .filter(e => monthOf(e.date) === month)
    // Newest first, so the month reads back the way you lived it
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const spent = rows.reduce((sum, e) => sum + e.amount, 0);
  const earned = incomeForMonth(month);

  $("monthSheetTitle").textContent = monthLabel(month);

  const sym = symbolFor(getCurrency());

  $("monthSheetSummary").textContent =
    `Spent ${totalsByCurrency(rows)}` +
    (earned > 0
      ? `  ·  Earned ${sym} ${money(earned)}  ·  ` +
        `${earned - spent >= 0 ? "Saved" : "Over by"} ` +
        sym + " " + money(Math.abs(earned - spent))
      : "");

  const list = $("monthSheetList");
  list.innerHTML = "";

  if (!rows.length) {
    list.innerHTML = '<div class="empty">Nothing recorded.</div>';
  }

  // Group under day headings - a bare list of 60 rows is hard to
  // read; day breaks give it structure at no cost.
  let lastDate = null;

  rows.forEach(e => {
    if (e.date !== lastDate) {
      lastDate = e.date;

      const heading = document.createElement("div");
      heading.className = "day-heading";
      heading.textContent = prettyDate(e.date);
      list.appendChild(heading);
    }

    const row = document.createElement("div");
    row.className = "expense";

    row.innerHTML = `
      <div class="expense-bar" style="background:${colourFor(e.category)}"></div>
      <div class="expense-main">
        <div class="expense-title"></div>
        <div class="expense-meta"></div>
      </div>
      <div class="expense-amount">${amountWithCurrency(e)}</div>
    `;

    row.querySelector(".expense-title").textContent = e.note || e.category;
    row.querySelector(".expense-meta").textContent =
      `${e.category} · ${e.payment} · ${entryTime(e) || ""}`;

    list.appendChild(row);
  });

  $("monthSheet").classList.remove("hidden");
}


function renderAll() {
  renderCurrency();
  renderChips();
  renderIncomeChips();
  renderTotals();
  renderMonthFilter();
  renderList();
  renderIncomeList();
  renderMonthCards();
  renderBreakdown();
  renderInsights();
}


/* ------------------------------------------------------------
   TABS
   ------------------------------------------------------------ */

function showTab(name) {
  state.tab = name;

  ["spend", "income", "insights"].forEach(tab => {
    $("panel-" + tab).classList.toggle("hidden", tab !== name);
    $("tab-" + tab).classList.toggle("active", tab === name);
  });

  window.scrollTo({ top: 0, behavior: "instant" });
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
    currency: getCurrency(),
    category: state.category,
    payment: state.payment,
    note: $("note").value.trim(),
    date: $("date").value || todayISO()
  });

  $("amount").value = "";
  $("note").value = "";

  state.month = monthOf($("date").value || todayISO());

  renderAll();
  setStatus(
    `Added ${symbolFor(getCurrency())} ${money(amount)} · ${state.category}`,
    "var(--good)"
  );

  // A short buzz confirms the save without needing to look.
  if (navigator.vibrate) navigator.vibrate(15);
}


function doSaveIncome() {
  const raw = $("incomeAmount").value.trim().replace(/,/g, "");

  if (!raw) {
    setIncomeStatus("Enter an amount.", "var(--warn)");
    return;
  }

  const amount = parseFloat(raw);

  if (isNaN(amount) || amount <= 0) {
    setIncomeStatus("That is not a valid amount.", "var(--danger)");
    return;
  }

  const month = $("incomeMonth").value || monthOf(todayISO());

  addIncome({
    amount: amount,
    currency: getCurrency(),
    source: state.incomeSource,
    note: $("incomeNote").value.trim(),
    month: month
  });

  $("incomeAmount").value = "";
  $("incomeNote").value = "";

  state.month = month;

  renderAll();
  setIncomeStatus(
    `Added ${symbolFor(getCurrency())} ${money(amount)} · ${state.incomeSource}`,
    "var(--good)"
  );

  if (navigator.vibrate) navigator.vibrate(15);
}


function toggleCurrency() {
  const codes = Object.keys(CURRENCIES);
  const next = codes[(codes.indexOf(getCurrency()) + 1) % codes.length];

  setCurrency(next);
  renderCurrency();
  renderAll();

  setStatus(`Now recording in ${CURRENCIES[next].label}.`, "var(--muted)");
}


function renderCurrency() {
  const symbol = symbolFor(getCurrency());

  $("currencySymbol").textContent = symbol;
  $("currencySymbol2").textContent = symbol;
}


function setIncomeStatus(text, colour) {
  const el = $("incomeStatus");
  el.textContent = text;
  el.style.color = colour || "var(--muted)";
}


function rowMenu(expense) {
  const choice = prompt(
    `${expense.note || expense.category} — ${amountWithCurrency(expense)}\n\n` +
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

    // A new search should start collapsed, or the previous
    // "show all" leaks into unrelated results.
    state.expandedExpenses = false;
    renderList();
  });

  $("monthFilter").addEventListener("change", e => {
    state.month = e.target.value;
    state.expandedExpenses = false;
    state.expandedIncome = false;
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

  $("closeMonthSheet").onclick =
    () => $("monthSheet").classList.add("hidden");

  $("monthSheet").onclick = e => {
    if (e.target.id === "monthSheet") {
      $("monthSheet").classList.add("hidden");
    }
  };

  $("voiceBtn").onclick = toggleVoice;

  ["spend", "income", "insights"].forEach(tab => {
    $("tab-" + tab).onclick = () => showTab(tab);
  });

  $("saveIncomeBtn").onclick = doSaveIncome;

  $("incomeAmount").addEventListener("keydown", e => {
    if (e.key === "Enter") doSaveIncome();
  });

  [["currencyBtn", "currencySymbol"],
   ["currencyBtn2", "currencySymbol2"]].forEach(([btn]) => {
    $(btn).onclick = toggleCurrency;
  });

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
    ["Type", "Date", "Time", "Currency", "Amount",
     "Category", "Payment", "Note"].join(",")
  ];

  rows.forEach(e => {
    lines.push([
      "Expense",
      csvCell(e.date),
      csvCell(entryTime(e)),
      csvCell(e.currency || DEFAULT_CURRENCY),
      csvCell(e.amount),
      csvCell(e.category),
      csvCell(e.payment),
      csvCell(e.note)
    ].join(","));
  });

  // Income in the same file, tagged by Type so a spreadsheet
  // filter or pivot can split them. Two files would mean two
  // shares and two things to lose.
  const incomeRows = getIncome()
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month) || a.id - b.id);

  incomeRows.forEach(e => {
    lines.push([
      "Income",
      csvCell(e.month + "-01"),
      csvCell(entryTime(e)),
      csvCell(e.currency || DEFAULT_CURRENCY),
      csvCell(e.amount),
      csvCell(e.source),
      "Cash",
      csvCell(e.note)
    ].join(","));
  });

  // A total per currency. One combined figure across PKR and
  // USD would be arithmetic on incompatible units.
  const used = new Set([
    ...rows.map(e => e.currency || DEFAULT_CURRENCY),
    ...incomeRows.map(e => e.currency || DEFAULT_CURRENCY)
  ]);

  lines.push("");

  [...used].sort().forEach(code => {
    const spent = rows
      .filter(e => (e.currency || DEFAULT_CURRENCY) === code)
      .reduce((sum, e) => sum + e.amount, 0);

    const earned = incomeRows
      .filter(e => (e.currency || DEFAULT_CURRENCY) === code)
      .reduce((sum, e) => sum + e.amount, 0);

    lines.push(["", "", "", code, spent, "TOTAL EXPENSES", "", ""].join(","));
    lines.push(["", "", "", code, earned, "TOTAL INCOME", "", ""].join(","));
    lines.push(["", "", "", code, earned - spent, "NET", "", ""].join(","));
    lines.push("");
  });

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
    version: 2,
    exportedAt: new Date().toISOString(),
    expenses: getExpenses(),
    categories: getCategories(),
    income: getIncome()
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

    // Income arrived in version 2 backups. Older files simply
    // will not have it, which must not be treated as an error.
    let incomeAdded = 0;

    if (Array.isArray(data.income)) {
      const existingIncome = getIncome();
      const seenIncome = new Set(existingIncome.map(e => e.id));
      const newIncome = data.income.filter(e => !seenIncome.has(e.id));

      setIncome(existingIncome.concat(newIncome));
      incomeAdded = newIncome.length;
    }

    renderAll();

    const skipped = data.expenses.length - incoming.length;

    setStatus(
      `Imported ${incoming.length} expense(s)` +
      (incomeAdded ? ` and ${incomeAdded} income entr(y/ies)` : "") +
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
  $("incomeMonth").value = monthOf(todayISO());
  wireUp();
  setupVoice();
  renderAll();
  setupInstall();
  registerServiceWorker();
}

document.addEventListener("DOMContentLoaded", init);
