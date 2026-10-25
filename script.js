"use strict";

/* ---------- Storage ---------- */
const EVENTS_KEY = "cep_events_v1";
const REGS_KEY = "cep_registrations_v1";

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

/* Dates are generated relative to today so the sample events are always upcoming. */
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function seedEvents() {
  return [
    { id: 1, title: "Code Sprint Hackathon", category: "Technical", date: dayOffset(1), time: "09:00", venue: "Computer Lab 2", capacity: 40,
      description: "A 6-hour team hackathon. Build a working prototype from a surprise problem statement." },
    { id: 2, title: "Cultural Night", category: "Cultural", date: dayOffset(6), time: "18:00", venue: "Main Auditorium", capacity: 200,
      description: "Music, dance and drama performances by student clubs. Open to all departments." },
    { id: 3, title: "Inter-Department Cricket", category: "Sports", date: dayOffset(9), time: "08:30", venue: "College Ground", capacity: 60,
      description: "Knockout cricket tournament. Register as an individual; teams are formed on the day." },
    { id: 4, title: "Resume & Interview Workshop", category: "Career", date: dayOffset(12), time: "14:00", venue: "Seminar Hall", capacity: 80,
      description: "Learn to write a strong resume and handle common interview questions with a placement mentor." },
    { id: 5, title: "Photography Walk", category: "Cultural", date: dayOffset(15), time: "07:00", venue: "Botanical Garden", capacity: 25,
      description: "Guided campus and garden photo walk. Bring your phone or camera." },
    { id: 6, title: "Web Dev Bootcamp", category: "Technical", date: dayOffset(20), time: "10:00", venue: "Computer Lab 1", capacity: 3,
      description: "Hands-on HTML, CSS and JavaScript session. Very limited seats." },
  ];
}

let events = load(EVENTS_KEY, null);
if (!events) { events = seedEvents(); save(EVENTS_KEY, events); }
let regs = load(REGS_KEY, []);

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const countFor = (eventId) => regs.filter((r) => r.eventId === eventId).length;
const seatsLeft = (ev) => ev.capacity - countFor(ev.id);
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const daysUntil = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
const canCancel = (ev) => daysUntil(ev.date) >= 2;   // cancellation closes 1 day before the event

let toastTimer;
function toast(msg, bad = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2800);
}

/* ---------- Browse view ---------- */
function fillCategories() {
  const cats = [...new Set(events.map((e) => e.category))].sort();
  $("fCategory").innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join("");
}

function renderEvents() {
  const name = $("fName").value.trim().toLowerCase();
  const cat = $("fCategory").value;
  const date = $("fDate").value;

  const list = events
    .filter((e) => (!name || e.title.toLowerCase().includes(name))
      && (!cat || e.category === cat)
      && (!date || e.date === date))
    .sort((a, b) => a.date.localeCompare(b.date));

  $("resultInfo").textContent = `${list.length} event${list.length === 1 ? "" : "s"} found`;

  if (!list.length) {
    $("eventGrid").innerHTML = '<div class="empty">No events match your filters. Try clearing them.</div>';
    return;
  }

  $("eventGrid").innerHTML = list.map((e) => {
    const left = seatsLeft(e);
    const full = left <= 0;
    const mine = isRegisteredAny(e.id);
    return `
      <article class="card">
        <div class="card-date"><span>${fmtDate(e.date)}</span><span>${esc(e.time)}</span></div>
        <div class="card-body">
          <span class="tag">${esc(e.category)}</span>
          <h3>${esc(e.title)}</h3>
          <p class="meta">${esc(e.venue)}</p>
          <p class="desc">${esc(e.description)}</p>
        </div>
        <div class="card-foot">
          <span class="count ${full ? "full" : ""}">${countFor(e.id)} registered · ${full ? "Full" : left + " left"}</span>
          <button class="btn" data-open="${e.id}">${mine ? "View" : full ? "Details" : "Register"}</button>
        </div>
      </article>`;
  }).join("");
}

/* Remembers the email last used on this device, to mark events as registered */
const lastEmail = () => localStorage.getItem("cep_last_email") || "";
const isRegisteredAny = (eventId) => regs.some((r) => r.eventId === eventId && r.email === lastEmail());

/* ---------- My registrations view ---------- */
function renderMine() {
  const mine = regs.filter((r) => r.email === lastEmail());
  $("myCount").textContent = mine.length;

  if (!mine.length) {
    $("myList").innerHTML = '<div class="empty">You have no registrations yet. Register for an event to see it here.</div>';
    return;
  }

  $("myList").innerHTML = mine.map((r) => {
    const ev = events.find((e) => e.id === r.eventId);
    if (!ev) return "";
    const cancellable = canCancel(ev);
    return `
      <div class="row">
        <div>
          <h3>${esc(ev.title)}</h3>
          <p class="meta">${fmtDate(ev.date)} · ${esc(ev.time)} · ${esc(ev.venue)}</p>
          <p class="note">Registered as ${esc(r.name)} (${esc(r.email)})</p>
        </div>
        ${cancellable
          ? `<button class="btn danger" data-cancel="${r.id}">Cancel registration</button>`
          : `<span class="note">Cancellation closed (event is within 1 day)</span>`}
      </div>`;
  }).join("");
}

/* ---------- Dialog ---------- */
const dlg = $("eventDialog");
let currentEvent = null;

function openEvent(id) {
  currentEvent = events.find((e) => e.id === id);
  const e = currentEvent;
  $("dTitle").textContent = e.title;
  $("dMeta").textContent = `${fmtDate(e.date)} · ${e.time} · ${e.venue} · ${e.category}`;
  $("dDesc").textContent = e.description;
  refreshSeats();
  clearErrors();
  $("regForm").reset();
  $("rEmail").value = lastEmail();
  dlg.showModal();
}

function refreshSeats() {
  const e = currentEvent;
  const left = seatsLeft(e);
  $("dSeats").textContent = left > 0
    ? `${countFor(e.id)} registered · ${left} of ${e.capacity} seats left`
    : `${countFor(e.id)} registered · This event is full`;
  $("submitBtn").disabled = left <= 0;
}

function clearErrors() {
  document.querySelectorAll(".err").forEach((el) => (el.textContent = ""));
  document.querySelectorAll("input.invalid").forEach((el) => el.classList.remove("invalid"));
}

function setError(inputId, errId, msg) {
  $(errId).textContent = msg;
  $(inputId).classList.add("invalid");
}

function validate() {
  clearErrors();
  const name = $("rName").value.trim();
  const email = $("rEmail").value.trim().toLowerCase();
  const roll = $("rRoll").value.trim();
  const phone = $("rPhone").value.trim();
  let ok = true;

  if (!name) { setError("rName", "eName", "Enter your full name."); ok = false; }
  if (!email) { setError("rEmail", "eEmail", "Enter your email."); ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError("rEmail", "eEmail", "Enter a valid email, like name@college.edu."); ok = false; }
  if (!roll) { setError("rRoll", "eRoll", "Enter your roll number."); ok = false; }
  if (!phone) { setError("rPhone", "ePhone", "Enter your phone number."); ok = false; }
  else if (!/^\d{10}$/.test(phone)) { setError("rPhone", "ePhone", "Phone number must be exactly 10 digits."); ok = false; }

  return ok ? { name, email, roll, phone } : null;
}

$("regForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const data = validate();
  if (!data) return;

  const e = currentEvent;
  if (seatsLeft(e) <= 0) { $("formMsg").textContent = "Sorry, this event is full."; return; }
  if (regs.some((r) => r.eventId === e.id && r.email === data.email)) {
    setError("rEmail", "eEmail", "This email is already registered for this event.");
    return;
  }

  regs.push({ id: Date.now(), eventId: e.id, ...data, createdAt: new Date().toISOString() });
  save(REGS_KEY, regs);
  localStorage.setItem("cep_last_email", data.email);

  dlg.close();
  toast(`You're registered for ${e.title}.`);
  refreshAll();
});

$("dClose").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });  // click outside closes

/* ---------- Events wiring ---------- */
$("eventGrid").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open]");
  if (btn) openEvent(Number(btn.dataset.open));
});

$("myList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cancel]");
  if (!btn) return;
  const reg = regs.find((r) => r.id === Number(btn.dataset.cancel));
  const ev = reg && events.find((x) => x.id === reg.eventId);
  if (!ev) return;
  if (!canCancel(ev)) { toast("Cancellation is closed for this event.", true); return; }
  if (!confirm(`Cancel your registration for "${ev.title}"?`)) return;
  regs = regs.filter((r) => r.id !== reg.id);
  save(REGS_KEY, regs);
  toast("Registration cancelled.");
  refreshAll();
});

["fName", "fCategory", "fDate"].forEach((id) => {
  $(id).addEventListener("input", renderEvents);
  $(id).addEventListener("change", renderEvents);
});
$("clearFilters").addEventListener("click", () => {
  $("filters").reset();
  renderEvents();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("view-browse").hidden = tab.dataset.view !== "browse";
    $("view-mine").hidden = tab.dataset.view !== "mine";
  });
});

function refreshAll() { renderEvents(); renderMine(); }

/* ---------- Start ---------- */
fillCategories();
refreshAll();
