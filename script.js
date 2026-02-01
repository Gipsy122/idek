import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, onValue, update, set, push
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* ================= FIREBASE ================= */

const firebaseConfig = {
  apiKey: "AIzaSyCNxYid-xgcMWAqYYp8XMDM84ygtYJHn4A",
  authDomain: "idek-c2.firebaseapp.com",
  databaseURL: "https://idek-c2-default-rtdb.firebaseio.com",
  projectId: "idek-c2",
  storageBucket: "idek-c2.firebasestorage.app",
  messagingSenderId: "462533995335",
  appId: "1:462533995335:web:72330a59af61dd9b98ba62"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ================= ROLE ================= */

const isAdmin = new URLSearchParams(location.search).get("admin") === "true";
document.getElementById("roleLabel").innerText = isAdmin ? "Admin Panel" : "User View";
if (isAdmin) document.getElementById("adminPanel").classList.remove("hidden");

/* ================= DEFAULT DATA ================= */

const baseRef = ref(db, "system");

set(baseRef, {
  timers: {
    bath: { limit: 1800, remaining: 1800, running: false },
    food: { limit: 2700, used: 0 },
    washroom: { limit: 1800, used: 0 },
    sleep: { limit: 25200, remaining: 25200, running: false },
    unnecessary: { limit: 1200, remaining: 1200 }
  },
  breakGauge: { limit: 12600, remaining: 12600 },
  coupons: {}
});

/* ================= RENDER ================= */

const timersDiv = document.getElementById("timers");
const couponsDiv = document.getElementById("coupons");
const adminControls = document.getElementById("adminControls");

onValue(baseRef, snap => {
  const data = snap.val();
  renderTimers(data);
  renderCoupons(data.coupons || {});
});

/* ================= TIMERS ================= */

function renderTimers(data) {
  timersDiv.innerHTML = "";

  for (let key in data.timers) {
    const t = data.timers[key];

    const div = document.createElement("div");
    div.className = "glass timer";

    div.innerHTML = `
      <h4>${key.toUpperCase()}</h4>
      ${t.remaining !== undefined ? `
        <div class="circle">
          ${(t.remaining / 60).toFixed(1)}m
        </div>` : `
        <p>Used: ${t.used}</p>
      `}
      ${isAdmin ? `
        <button onclick="toggle('${key}')">Start/Stop</button>
        <button onclick="addTime('${key}',300)">+5m</button>
      ` : ``}
    `;

    timersDiv.appendChild(div);
  }

  // Break Gauge
  const bg = data.breakGauge;
  const g = document.createElement("div");
  g.className = "glass";
  g.innerHTML = `
    <h4>3.5h Break Gauge</h4>
    <div class="bar">
      <div class="fill" style="width:${(bg.remaining/bg.limit)*100}%"></div>
    </div>
    <p>${(bg.remaining/60).toFixed(1)} mins left</p>
  `;
  timersDiv.appendChild(g);
}

/* ================= ADMIN ACTIONS ================= */

window.toggle = function (key) {
  const r = ref(db, `system/timers/${key}/running`);
  onValue(r, s => update(ref(db, `system/timers/${key}`), { running: !s.val() }), { once: true });
};

window.addTime = function (key, sec) {
  const r = ref(db, `system/timers/${key}/remaining`);
  onValue(r, s => update(ref(db, `system/timers/${key}`), {
    remaining: s.val() + sec
  }), { once: true });
};

/* ================= COUPONS ================= */

function renderCoupons(coupons) {
  couponsDiv.innerHTML = "";
  Object.entries(coupons).forEach(([id, c]) => {
    if (c.used) return;
    const div = document.createElement("div");
    div.className = "glass";
    div.innerHTML = `
      <p>${c.reward}</p>
      ${!isAdmin ? `<button onclick="redeem('${id}')">Redeem</button>` : ``}
    `;
    couponsDiv.appendChild(div);
  });
}

window.redeem = function (id) {
  update(ref(db, `system/coupons/${id}`), { used: true });
};

/* ================= TIMER ENGINE ================= */

setInterval(() => {
  onValue(baseRef, snap => {
    const d = snap.val();
    let updates = {};

    for (let k in d.timers) {
      const t = d.timers[k];
      if (t.running && t.remaining > 0) {
        updates[`timers/${k}/remaining`] = t.remaining - 1;
      } else if (t.running && t.remaining <= 0) {
        updates["breakGauge/remaining"] = Math.max(0, d.breakGauge.remaining - 1);
      }
    }

    if (Object.keys(updates).length)
      update(baseRef, updates);

  }, { once: true });
}, 1000);
