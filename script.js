const firebaseConfig = {
    apiKey: "AIzaSyCNxYid-xgcMWAqYYp8XMDM84ygtYJHn4A",
    authDomain: "idek-c2.firebaseapp.com",
    databaseURL: "https://idek-c2-default-rtdb.firebaseio.com",
    projectId: "idek-c2",
    storageBucket: "idek-c2.firebasestorage.app",
    messagingSenderId: "462533995335",
    appId: "1:462533995335:web:72330a59af61dd9b98ba62"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';
if (isAdmin) document.getElementById('admin-indicator').classList.remove('hidden');
if (isAdmin) document.getElementById('admin-coupon-controls').classList.remove('hidden');

const INITIAL_DATA = {
    timers: {
        bath: { label: 'Bath', limit: 30 * 60, current: 30 * 60, running: false, type: 'circular' },
        food: { label: 'Food (3x)', limit: 45 * 60, current: 45 * 60, running: false, type: 'circular' },
        washroom: { label: 'Washroom (2x)', limit: 30 * 60, current: 30 * 60, running: false, type: 'circular' },
        sleep: { label: 'Sleep', limit: 7 * 3600, current: 7 * 3600, running: false, type: 'circular' },
        fun: { label: 'Weekly Fun', limit: 3600, current: 3600, running: false, type: 'circular' }
    },
    gauges: {
        main: { label: 'Break Gauge', limit: 3.5 * 3600, current: 3.5 * 3600, running: true },
        off: { label: 'Unnecessary Off', limit: 20 * 60, current: 20 * 60, running: false }
    },
    coupons: {}
};

// --- CORE LOGIC ---

function updateUI(data) {
    const container = document.getElementById('timers-container');
    container.innerHTML = '';

    // Render Gauges
    updateGauge('break', data.gauges.main);
    updateGauge('off', data.gauges.off);

    // Render Circular Timers
    Object.keys(data.timers).forEach(key => {
        const timer = data.timers[key];
        const isOverflow = timer.current < 0;
        
        const card = document.createElement('div');
        card.className = `timer-card ${isOverflow ? 'overflow' : ''}`;
        card.innerHTML = `
            <h4>${timer.label}</h4>
            <div class="timer-circle">${formatTime(timer.current)}</div>
            ${isAdmin ? `
                <div class="admin-controls">
                    <button onclick="toggleTimer('${key}')">${timer.running ? 'STOP' : 'START'}</button>
                    <input type="number" id="adj-${key}" placeholder="Add mins">
                    <button onclick="adjustTimer('${key}')">Apply</button>
                </div>
            ` : ''}
        `;
        container.appendChild(card);
    });

    // Render Coupons
    const couponList = document.getElementById('coupon-list');
    couponList.innerHTML = '';
    if (data.coupons) {
        Object.keys(data.coupons).forEach(id => {
            const c = data.coupons[id];
            if (!c.used) {
                couponList.innerHTML += `
                    <div class="coupon-item">
                        <span>${id} (+${c.reward}m) - Exp: ${c.expiry}</span>
                        ${!isAdmin ? `<button onclick="redeemCoupon('${id}')">Redeem</button>` : ''}
                    </div>
                `;
            }
        });
    }
}

function updateGauge(id, gauge) {
    const fill = document.getElementById(`${id}-gauge-fill`);
    const text = document.getElementById(`${id}-gauge-text`);
    const pct = Math.max(0, (gauge.current / gauge.limit) * 100);
    
    fill.style.width = `${pct}%`;
    text.innerText = formatTime(gauge.current);
    
    if (gauge.current <= 0) fill.classList.add('warning');
    else fill.classList.remove('warning');
}

function formatTime(seconds) {
    const abs = Math.abs(seconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    const sign = seconds < 0 ? '-' : '';
    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// --- FIREBASE ACTIONS ---

function toggleTimer(key) {
    db.ref(`timers/${key}`).once('value', snap => {
        const state = snap.val();
        db.ref(`timers/${key}/running`).set(!state.running);
    });
}

function adjustTimer(key) {
    const val = parseInt(document.getElementById(`adj-${key}`).value);
    if (isNaN(val)) return;
    db.ref(`timers/${key}/current`).transaction(cur => cur + (val * 60));
}

function createCoupon() {
    const code = document.getElementById('coupon-code').value;
    const reward = parseInt(document.getElementById('coupon-reward').value);
    const expiry = document.getElementById('coupon-expiry').value;
    if (!code || isNaN(reward)) return;
    db.ref(`coupons/${code}`).set({ reward, expiry, used: false });
}

function redeemCoupon(code) {
    db.ref(`coupons/${code}`).once('value', snap => {
        const c = snap.val();
        if (c && !c.used && new Date(c.expiry) > new Date()) {
            db.ref(`gauges/main/current`).transaction(cur => cur + (c.reward * 60));
            db.ref(`coupons/${code}/used`).set(true);
            alert("Reward Applied!");
        } else {
            alert("Invalid or Expired");
        }
    });
}

// --- TICK LOGIC (Real-time Calculation) ---
// We run the tick every second and sync to Firebase
if (isAdmin) {
    setInterval(() => {
        db.ref().once('value', snap => {
            const data = snap.val();
            if (!data) return;

            let updates = {};
            let overflowDeduction = 0;

            // Handle Activities
            Object.keys(data.timers).forEach(key => {
                let t = data.timers[key];
                if (t.running) {
                    let newVal = t.current - 1;
                    updates[`timers/${key}/current`] = newVal;
                    if (newVal < 0) overflowDeduction += 1; // 1s per second
                }
            });

            // Handle Unnecessary Off Gauge
            if (data.gauges.off.running) {
                let newVal = data.gauges.off.current - 1;
                updates[`gauges/off/current`] = newVal;
                if (newVal < 0) overflowDeduction += 1;
            }

            // Apply Overflow to Main Gauge
            if (overflowDeduction > 0) {
                updates[`gauges/main/current`] = data.gauges.main.current - overflowDeduction;
            }

            db.ref().update(updates);
        });
    }, 1000);
}

// Listen for Changes
db.ref().on('value', snap => {
    const data = snap.val();
    if (data) updateUI(data);
    else db.ref().set(INITIAL_DATA); // Init DB if empty
});
