/**
 * 🤖 MultiBiz Salon WhatsApp Bot
 * ================================
 * Server that handles WhatsApp conversations via UltraMsg webhook
 * Deploy on: Render.com, Railway.app, Fly.io, or any Node.js host
 *
 * Required environment variables:
 *   - ULTRAMSG_INSTANCE     (e.g., "instance169491")
 *   - ULTRAMSG_TOKEN        (your UltraMsg token)
 *   - SALON_NAME            (e.g., "صالون النجمة")
 *   - SALON_PHONE           (e.g., "+212661234567")
 *   - SALON_ADDRESS         (optional)
 *   - API_SECRET            (random string, protects /api endpoints)
 *   - PORT                  (optional, Render sets this automatically)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS for MultiBiz frontend to read bookings
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ============ CONFIG ============
const CONFIG = {
  instance: process.env.ULTRAMSG_INSTANCE || '',
  token: process.env.ULTRAMSG_TOKEN || '',
  salonName: process.env.SALON_NAME || 'الصالون',
  salonPhone: process.env.SALON_PHONE || '',
  salonAddress: process.env.SALON_ADDRESS || '',
  apiSecret: process.env.API_SECRET || 'change-me-please',
  port: process.env.PORT || 3000
};

// ============ DATA STORAGE ============
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const SERVICES_FILE = path.join(DATA_DIR, 'services.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let services = loadJSON(SERVICES_FILE, [
  { id: 1, name: 'حلاقة عادية', price: 30, duration: 20 },
  { id: 2, name: 'حلاقة + غسيل', price: 50, duration: 30 },
  { id: 3, name: 'حلاقة ذقن', price: 20, duration: 15 },
  { id: 4, name: 'صبغ', price: 80, duration: 60 },
  { id: 5, name: 'خدمة كاملة', price: 100, duration: 75 }
]);
saveJSON(SERVICES_FILE, services);

let schedule = loadJSON(SCHEDULE_FILE, {
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  hours: [
    { start: '09:00', end: '13:00' },
    { start: '15:00', end: '22:00' }
  ],
  slotDuration: 30
});
saveJSON(SCHEDULE_FILE, schedule);

let sessions = loadJSON(SESSIONS_FILE, {});
let bookings = loadJSON(BOOKINGS_FILE, []);

// ============ WHATSAPP SENDER ============
async function sendWhatsApp(to, body) {
  if (!CONFIG.instance || !CONFIG.token) {
    console.warn('[WA] Missing credentials, cannot send');
    return { error: 'not configured' };
  }
  const url = `https://api.ultramsg.com/${CONFIG.instance}/messages/chat`;
  const params = new URLSearchParams();
  params.append('token', CONFIG.token);
  params.append('to', to);
  params.append('body', body);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await r.json();
    console.log(`[WA] → ${to}: ${data.sent ? '✓' : '✗'} ${data.error || ''}`);
    return data;
  } catch (e) {
    console.error('[WA] Error:', e.message);
    return { error: e.message };
  }
}

// ============ BOT LOGIC ============
const DAY_NAMES_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const MONTH_NAMES_AR = ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'];

function greeting() {
  return `السلام عليكم! 👋
مرحبا بك ف *${CONFIG.salonName}*

باش نعاونك:
*1️⃣* حجز موعد جديد
*2️⃣* شوف مواعيدي
*3️⃣* ألغي موعد
*4️⃣* معلومات الصالون

كتب الرقم 👇`;
}

function servicesList() {
  return services.map(s => `*${s.id}*. ${s.name} — ${s.price} درهم`).join('\n');
}

function getAvailableDays() {
  const days = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = 0; i < 10; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const dow = d.getDay();
    if (!schedule.workingDays.includes(dow)) continue;
    days.push({
      date: d.toISOString().slice(0, 10),
      dow,
      dayNum: d.getDate(),
      label: i === 0 ? 'اليوم' : i === 1 ? 'غدا' : `${DAY_NAMES_AR[dow]} ${d.getDate()} ${MONTH_NAMES_AR[d.getMonth()]}`
    });
    if (days.length >= 7) break;
  }
  return days;
}

function getAvailableSlots(dateISO, serviceDuration) {
  const hoursArr = Array.isArray(schedule.hours) ? schedule.hours : [schedule.hours];
  const slotMin = schedule.slotDuration || 30;
  const serviceDur = serviceDuration || slotMin;
  const bookedMinutes = bookings
    .filter(b => b.date === dateISO && b.status !== 'cancelled')
    .map(b => {
      const [h, m] = b.time.split(':').map(Number);
      return h * 60 + m;
    });
  const now = new Date();
  const isToday = dateISO === now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const result = { morning: [], afternoon: [] };
  hoursArr.forEach((h, idx) => {
    const [sh, sm] = h.start.split(':').map(Number);
    const [eh, em] = h.end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    for (let t = startMin; t + serviceDur <= endMin; t += slotMin) {
      const time = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
      let conflict = false;
      for (const bt of bookedMinutes) if (Math.abs(bt - t) < serviceDur) { conflict = true; break; }
      const inPast = isToday && t <= nowMin + 15;
      if (!conflict && !inPast) {
        (idx === 0 ? result.morning : result.afternoon).push(time);
      }
    }
  });
  return result;
}

function getSession(phone) {
  if (!sessions[phone]) {
    sessions[phone] = { step: 'menu', data: {}, lastSeen: Date.now() };
  }
  sessions[phone].lastSeen = Date.now();
  return sessions[phone];
}

function resetSession(phone) {
  delete sessions[phone];
}

async function handleMessage(phone, text) {
  text = (text || '').trim();
  const lower = text.toLowerCase();
  const session = getSession(phone);

  // Reset keywords
  if (['إلغاء','الغاء','cancel','خرج','رجوع','menu','قائمة','start','ابدا','ابدأ'].includes(lower)) {
    resetSession(phone);
    saveJSON(SESSIONS_FILE, sessions);
    return greeting();
  }

  // === MAIN MENU ===
  if (session.step === 'menu' || !session.step) {
    if (text === '1') {
      session.step = 'choose_service';
      saveJSON(SESSIONS_FILE, sessions);
      return `ممتاز ✂️\n\nاختار الخدمة:\n\n${servicesList()}\n\n_كتب الرقم_ 👇`;
    }
    if (text === '2') {
      const myBookings = bookings.filter(b => b.phone === phone && b.status !== 'cancelled' && new Date(b.datetime).getTime() > Date.now());
      if (!myBookings.length) {
        resetSession(phone);
        saveJSON(SESSIONS_FILE, sessions);
        return `ما عندك حتى موعد قادم 📭\n\nبغيتي تحجز موعد جديد؟\nكتب *1*`;
      }
      const list = myBookings.map((b, i) => {
        const d = new Date(b.datetime);
        return `*${i+1}.* ${b.serviceName}\n📅 ${DAY_NAMES_AR[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} • ${b.time}\n💰 ${b.price} درهم`;
      }).join('\n\n');
      resetSession(phone);
      saveJSON(SESSIONS_FILE, sessions);
      return `📅 *مواعيدك القادمة:*\n\n${list}\n\n_كتب *قائمة* للرجوع_`;
    }
    if (text === '3') {
      const myBookings = bookings.filter(b => b.phone === phone && b.status !== 'cancelled' && new Date(b.datetime).getTime() > Date.now());
      if (!myBookings.length) {
        resetSession(phone);
        saveJSON(SESSIONS_FILE, sessions);
        return `ما عندك حتى موعد باش تلغي 📭`;
      }
      session.step = 'cancel_choose';
      session.data.cancelCandidates = myBookings.map(b => b.id);
      saveJSON(SESSIONS_FILE, sessions);
      const list = myBookings.map((b, i) => {
        const d = new Date(b.datetime);
        return `*${i+1}.* ${b.serviceName} — ${DAY_NAMES_AR[d.getDay()]} ${d.getDate()}/${d.getMonth()+1} ${b.time}`;
      }).join('\n');
      return `أي موعد بغيتي تلغي؟\n\n${list}\n\n_كتب الرقم_`;
    }
    if (text === '4') {
      resetSession(phone);
      saveJSON(SESSIONS_FILE, sessions);
      return `📍 *${CONFIG.salonName}*${CONFIG.salonAddress ? '\n\n🏠 ' + CONFIG.salonAddress : ''}${CONFIG.salonPhone ? '\n📞 ' + CONFIG.salonPhone : ''}\n\n⏰ *ساعات العمل:*\n${schedule.hours.map(h => h.start + ' - ' + h.end).join('\n')}\n\n📅 *أيام العمل:*\n${schedule.workingDays.map(d => DAY_NAMES_AR[d]).join('، ')}\n\n_كتب *قائمة* للرجوع_`;
    }
    return greeting();
  }

  // === CHOOSE SERVICE ===
  if (session.step === 'choose_service') {
    const idx = parseInt(text);
    const svc = services.find(s => s.id === idx);
    if (!svc) return `❌ رقم غير صحيح. اختار من:\n\n${servicesList()}`;
    session.data.service = svc;
    session.step = 'choose_day';
    const days = getAvailableDays();
    session.data.availableDays = days;
    saveJSON(SESSIONS_FILE, sessions);
    const list = days.map((d, i) => `*${i+1}.* ${d.label}`).join('\n');
    return `*${svc.name}* ✓\n\nاختار اليوم:\n\n${list}\n\n_كتب الرقم_`;
  }

  // === CHOOSE DAY ===
  if (session.step === 'choose_day') {
    const idx = parseInt(text) - 1;
    const days = session.data.availableDays || getAvailableDays();
    if (isNaN(idx) || idx < 0 || idx >= days.length) {
      const list = days.map((d, i) => `*${i+1}.* ${d.label}`).join('\n');
      return `❌ رقم غير صحيح. اختار يوم:\n\n${list}`;
    }
    const day = days[idx];
    session.data.date = day.date;
    session.data.dayLabel = day.label;
    const slots = getAvailableSlots(day.date, session.data.service.duration);
    if (!slots.morning.length && !slots.afternoon.length) {
      saveJSON(SESSIONS_FILE, sessions);
      return `😔 ما كاين حتى وقت متاح ف *${day.label}*.\n\nاختار يوم آخر:\n\n${days.map((d, i) => `*${i+1}.* ${d.label}`).join('\n')}`;
    }
    session.data.slots = { morning: slots.morning, afternoon: slots.afternoon };
    session.step = 'choose_time';
    saveJSON(SESSIONS_FILE, sessions);
    let num = 1;
    let reply = `*${day.label}* ✓\n\nاختار الساعة:\n`;
    if (slots.morning.length) {
      reply += '\n🌅 *صباح:*\n';
      reply += slots.morning.map(t => `*${num++}.* ${t}`).join('  ');
    }
    if (slots.afternoon.length) {
      reply += '\n\n🌆 *مساء:*\n';
      reply += slots.afternoon.map(t => `*${num++}.* ${t}`).join('  ');
    }
    reply += '\n\n_كتب الرقم_';
    return reply;
  }

  // === CHOOSE TIME ===
  if (session.step === 'choose_time') {
    const idx = parseInt(text) - 1;
    const all = [...(session.data.slots.morning||[]), ...(session.data.slots.afternoon||[])];
    if (isNaN(idx) || idx < 0 || idx >= all.length) {
      return `❌ رقم غير صحيح. اكتب رقم الساعة من اللائحة.`;
    }
    session.data.time = all[idx];
    session.step = 'enter_name';
    saveJSON(SESSIONS_FILE, sessions);
    return `*${all[idx]}* ✓\n\n*شنو سميتك؟* 👤\n\n_كتب سميتك كاملا_`;
  }

  // === ENTER NAME ===
  if (session.step === 'enter_name') {
    if (text.length < 2) return `❌ السمية قصيرة بزاف. كتب سميتك كاملا`;
    if (text.length > 60) return `❌ السمية طويلة بزاف`;
    session.data.name = text;
    session.step = 'confirm';
    saveJSON(SESSIONS_FILE, sessions);
    const d = session.data;
    return `تماما *${d.name}* 👋\n\n📋 *ملخص الحجز:*\n\n👤 ${d.name}\n📞 ${phone}\n📅 ${d.dayLabel}\n🕐 ${d.time}\n✂️ ${d.service.name}\n💰 ${d.service.price} درهم\n\nواش نأكد الحجز؟\n\n*1.* ✅ أكد\n*2.* ❌ ألغي`;
  }

  // === CONFIRM ===
  if (session.step === 'confirm') {
    if (text === '1') {
      const d = session.data;
      const datetime = new Date(d.date + 'T' + d.time + ':00').getTime();
      const booking = {
        id: 'bk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        phone, name: d.name,
        serviceId: d.service.id, serviceName: d.service.name, price: d.service.price,
        date: d.date, time: d.time, datetime,
        status: 'confirmed',
        source: 'whatsapp_bot',
        createdAt: Date.now()
      };
      bookings.push(booking);
      saveJSON(BOOKINGS_FILE, bookings);
      resetSession(phone);
      saveJSON(SESSIONS_FILE, sessions);
      return `✅ *تم الحجز بنجاح!*\n\nغنشوفوك:\n📅 ${d.dayLabel}\n🕐 ${d.time}\n✂️ ${d.service.name}\n\n📍 ${CONFIG.salonName}${CONFIG.salonAddress ? '\n🏠 ' + CONFIG.salonAddress : ''}\n\nإلا بغيتي تلغي كتب *3*\n\nمع السلامة 🙏`;
    }
    if (text === '2') {
      resetSession(phone);
      saveJSON(SESSIONS_FILE, sessions);
      return `تم الإلغاء ❌\n\nإلا بغيتي تعاود:\nكتب *قائمة*`;
    }
    return `❌ اختار *1* للتأكيد أو *2* للإلغاء`;
  }

  // === CANCEL CHOICE ===
  if (session.step === 'cancel_choose') {
    const idx = parseInt(text) - 1;
    const candidates = session.data.cancelCandidates || [];
    if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
      return `❌ رقم غير صحيح`;
    }
    const bookingId = candidates[idx];
    const b = bookings.find(x => x.id === bookingId);
    if (b) {
      b.status = 'cancelled';
      b.cancelledAt = Date.now();
      saveJSON(BOOKINGS_FILE, bookings);
    }
    resetSession(phone);
    saveJSON(SESSIONS_FILE, sessions);
    return `✅ *تم إلغاء الموعد*\n\nنتمناو نشوفوك مرة أخرى 🙏\n\nكتب *قائمة* للرجوع`;
  }

  // Fallback
  resetSession(phone);
  saveJSON(SESSIONS_FILE, sessions);
  return greeting();
}

// ============ WEBHOOK (UltraMsg calls this) ============
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const data = body.data || body;
    const from = data.from || '';
    const messageBody = data.body || '';
    const fromMe = data.fromMe || data.self || false;

    if (fromMe) return res.sendStatus(200);
    if (from.includes('@g.us')) return res.sendStatus(200); // ignore groups
    if (!from || !messageBody) return res.sendStatus(200);

    const phone = from.replace('@c.us', '').replace(/\D/g, '');
    console.log(`[IN] ${phone}: ${messageBody.slice(0, 50)}`);

    const reply = await handleMessage(phone, messageBody);
    if (reply) await sendWhatsApp(phone, reply);
    res.sendStatus(200);
  } catch (e) {
    console.error('[Webhook] Error:', e);
    res.sendStatus(500);
  }
});

// ============ API (for MultiBiz dashboard) ============
function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== CONFIG.apiSecret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/bookings', requireAuth, (req, res) => {
  const list = [...bookings].sort((a, b) => b.createdAt - a.createdAt);
  res.json({ bookings: list, total: list.length });
});

app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  bookings.splice(idx, 1);
  saveJSON(BOOKINGS_FILE, bookings);
  res.json({ ok: true });
});

app.put('/api/bookings/:id', requireAuth, (req, res) => {
  const b = bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  Object.assign(b, req.body);
  saveJSON(BOOKINGS_FILE, bookings);
  res.json(b);
});

app.get('/api/services', requireAuth, (req, res) => res.json(services));
app.put('/api/services', requireAuth, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array expected' });
  services = req.body;
  saveJSON(SERVICES_FILE, services);
  res.json(services);
});

app.get('/api/schedule', requireAuth, (req, res) => res.json(schedule));
app.put('/api/schedule', requireAuth, (req, res) => {
  schedule = { ...schedule, ...req.body };
  saveJSON(SCHEDULE_FILE, schedule);
  res.json(schedule);
});

app.post('/api/send', requireAuth, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone+message required' });
  const result = await sendWhatsApp(phone.replace(/\D/g, ''), message);
  res.json(result);
});

app.get('/api/stats', requireAuth, (req, res) => {
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const weekAgo = now - 7 * 86400000;
  res.json({
    total: bookings.length,
    active: bookings.filter(b => b.status !== 'cancelled' && b.datetime > now).length,
    completed: bookings.filter(b => b.datetime < now && b.status !== 'cancelled').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
    today: bookings.filter(b => b.datetime >= todayMs && b.datetime < todayMs + 86400000 && b.status !== 'cancelled').length,
    thisWeek: bookings.filter(b => b.createdAt >= weekAgo).length,
    revenue: bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + (Number(b.price) || 0), 0),
    activeSessions: Object.keys(sessions).length
  });
});

// ============ STATUS PAGE ============
app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"><title>${CONFIG.salonName} - Bot</title>
<style>body{font-family:system-ui;background:linear-gradient(135deg,#172B4D,#00875A);color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;text-align:center;padding:20px}
.card{background:rgba(255,255,255,0.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);padding:40px;border-radius:20px;max-width:480px}
h1{font-size:28px;margin:0 0 8px}.emoji{font-size:64px}
.status{background:#00875A;padding:6px 14px;border-radius:20px;display:inline-block;font-size:13px;margin-top:20px}
.stat{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1)}
.stat:last-child{border-bottom:0}small{opacity:0.6}</style></head>
<body><div class="card">
<div class="emoji">🤖</div>
<h1>${CONFIG.salonName}</h1>
<p><small>WhatsApp Booking Bot</small></p>
<div class="status">✅ خدام</div>
<div style="margin-top:24px;text-align:right">
  <div class="stat"><span>📱 الرقم:</span><strong>${CONFIG.salonPhone || 'غير محدد'}</strong></div>
  <div class="stat"><span>📅 الحجوزات:</span><strong>${bookings.length}</strong></div>
  <div class="stat"><span>💬 محادثات نشطة:</span><strong>${Object.keys(sessions).length}</strong></div>
  <div class="stat"><span>⚡ UltraMsg:</span><strong>${CONFIG.instance ? '✓ مضبوط' : '✗ غير مضبوط'}</strong></div>
</div>
<p style="margin-top:20px;font-size:12px;opacity:0.5">Powered by MultiBiz 🇲🇦</p>
</div></body></html>`);
});

app.get('/health', (req, res) => res.json({
  ok: true,
  uptime: process.uptime(),
  bookings: bookings.length,
  sessions: Object.keys(sessions).length
}));

// Cleanup stale sessions (>30 min)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const phone of Object.keys(sessions)) {
    if (now - (sessions[phone].lastSeen || 0) > 30 * 60 * 1000) {
      delete sessions[phone];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    saveJSON(SESSIONS_FILE, sessions);
    console.log(`[Cleanup] Removed ${cleaned} old sessions`);
  }
}, 5 * 60 * 1000);

// Daily reminders at 10am
let lastReminderDay = '';
setInterval(async () => {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  if (now.getHours() !== 10 || lastReminderDay === todayKey) return;
  lastReminderDay = todayKey;
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const tomorrowBookings = bookings.filter(b => b.date === tomorrow && b.status !== 'cancelled' && !b.reminderSent);
  console.log(`[Reminder] Sending ${tomorrowBookings.length} reminder(s)`);
  for (const b of tomorrowBookings) {
    const msg = `🔔 *تذكير بالموعد*\n\nمرحبا ${b.name} 👋\n\nعندك موعد *غدا*:\n📅 ${b.date} على *${b.time}*\n✂️ ${b.serviceName}\n\n📍 ${CONFIG.salonName}\n\nإلا ما غاديش تقدر تجي كتب *3* باش تلغي 🙏`;
    await sendWhatsApp(b.phone, msg);
    b.reminderSent = true;
    await new Promise(r => setTimeout(r, 2000));
  }
  if (tomorrowBookings.length) saveJSON(BOOKINGS_FILE, bookings);
}, 60 * 60 * 1000);

// ============ START ============
app.listen(CONFIG.port, () => {
  console.log(`\n🤖 ${CONFIG.salonName} Bot`);
  console.log(`   Port: ${CONFIG.port}`);
  console.log(`   UltraMsg: ${CONFIG.instance ? '✓' : '✗ NOT CONFIGURED'}`);
  console.log(`   Phone: ${CONFIG.salonPhone || 'not set'}`);
  console.log(`   Bookings loaded: ${bookings.length}`);
  console.log(`   Webhook: POST /webhook`);
  console.log(`   API: /api/* (X-Api-Key required)\n`);
});
