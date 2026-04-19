# 🤖 MultiBiz Salon WhatsApp Bot

Bot حقيقي للحجز عبر WhatsApp للصالونات المغربية. الزبون كيهدر معاه وكيحجز موعد تلقائياً.

---

## ✨ الميزات

- 💬 **محادثة ذكية بالعربية** مع الزبون (7 خطوات واضحة)
- 📅 **حجز تلقائي** — الزبون يختار الخدمة، اليوم، الساعة → الموعد يتسجل
- 🚫 **منع التعارض** — الأوقات المحجوزة ما كتبانش
- 🔔 **تذكيرات تلقائية** يوم قبل الموعد (على 10ص)
- ❌ **إلغاء المواعيد** — الزبون يقدر يلغي بنفسه
- 📊 **API للتطبيق** — MultiBiz يقدر يقرا ويدير الحجوزات
- 🌐 **صفحة حالة** — شوف الحالة الحية

---

## 🚀 النشر على Render.com (مجاناً، 15 دقيقة)

### المتطلبات:
- ✅ حساب على [github.com](https://github.com) (مجاني)
- ✅ حساب على [render.com](https://render.com) (مجاني)
- ✅ حساب UltraMsg [ultramsg.com](https://ultramsg.com) — (~$10/شهر)

---

### 📌 الخطوة 1: رفع الكود على GitHub

```bash
# ف مجلد bot اللي عندك
git init
git add .
git commit -m "Initial bot"

# خلق repo جديد ف github.com → New repository
# سميه: multibiz-salon-bot → Private ولا Public (على راحتك)

git remote add origin https://github.com/YOUR_USERNAME/multibiz-salon-bot.git
git branch -M main
git push -u origin main
```

---

### 📌 الخطوة 2: إنشاء خدمة على Render

1. روح لـ [dashboard.render.com](https://dashboard.render.com/)
2. اضغط **New +** → **Web Service**
3. اربط حساب GitHub (أول مرة)
4. اختار الـ repo ديالك (`multibiz-salon-bot`)
5. عمّر هاد المعلومات:

| الحقل | القيمة |
|-------|--------|
| **Name** | `multibiz-salon-bot` (أو أي اسم) |
| **Region** | `Frankfurt` (قريب من المغرب) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

---

### 📌 الخطوة 3: إعداد Environment Variables

ف صفحة Render، انزل لـ **Environment** → **Add Environment Variable** وزيد واحدة وحدة:

| Key | Value (مثال) |
|-----|--------------|
| `ULTRAMSG_INSTANCE` | `instance169491` (من UltraMsg Dashboard) |
| `ULTRAMSG_TOKEN` | `xxxxxxxxxxxxxxx` (من UltraMsg Dashboard) |
| `SALON_NAME` | `صالون النجمة` |
| `SALON_PHONE` | `+212661234567` |
| `SALON_ADDRESS` | `شارع محمد الخامس، الدار البيضاء` |
| `API_SECRET` | شي string طويل عشوائي (مثلا: `abc123xyz789-random-secret`) |

اضغط **Create Web Service**.

Render غيبدا يبني التطبيق. انتظر 2-3 دقائق حتى يتحول الحالة إلى **Live** 🟢.

---

### 📌 الخطوة 4: ربط UltraMsg بالـ Bot

1. نسخ الـ URL ديال التطبيق من Render — مثلاً:
   ```
   https://multibiz-salon-bot.onrender.com
   ```

2. روح لـ [app.ultramsg.com](https://app.ultramsg.com) → **Instance** → **Webhooks**

3. ف **"Webhook URL (events)"** حط:
   ```
   https://multibiz-salon-bot.onrender.com/webhook
   ```

4. فعّل **"Enable webhook"**

5. ف **"Events"** اختار:
   - ✅ **Message Received** (مهم!)

6. اضغط **Save**

---

### ✅ الخطوة 5: اختبار

1. من هاتف مختلف، بعث رسالة WhatsApp لرقم الصالون
2. كتب `السلام` أو `menu` أو `1`
3. الـ bot غيجاوب تلقائياً!

إلا ما جاوبش:
- تأكد من الـ Webhook URL ف UltraMsg صحيح
- شوف **Logs** ف Render Dashboard (عندك tab اسمو "Logs")
- تأكد من أن UltraMsg Instance خدام (لون أخضر)

---

## 🔧 الاستخدام اليومي

### محادثة عادية:

```
الزبون: السلام
  البوت: [القائمة الرئيسية]
الزبون: 1
  البوت: [لائحة الخدمات]
الزبون: 2
  البوت: [الأيام المتاحة]
الزبون: 3
  البوت: [الأوقات المتاحة]
الزبون: 5
  البوت: شنو سميتك؟
الزبون: أحمد
  البوت: [ملخص الحجز — أكد؟]
الزبون: 1
  البوت: ✅ تم الحجز!
```

### الكلمات السحرية (ف أي وقت):
- `قائمة` / `menu` → الرجوع للقائمة الرئيسية
- `إلغاء` → إلغاء المحادثة الحالية
- `1` → حجز جديد
- `2` → شوف مواعيدي
- `3` → ألغي موعد
- `4` → معلومات الصالون

---

## 📡 API Endpoints (للدashboard)

كل الـ API endpoints تتطلب header: `X-Api-Key: your-secret`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bookings` | كل الحجوزات |
| DELETE | `/api/bookings/:id` | حذف حجز |
| PUT | `/api/bookings/:id` | تعديل حجز |
| GET | `/api/services` | اللائحة ديال الخدمات |
| PUT | `/api/services` | تحديث الخدمات |
| GET | `/api/schedule` | أيام وساعات العمل |
| PUT | `/api/schedule` | تحديث الجدول |
| POST | `/api/send` | إرسال رسالة يدوية `{phone, message}` |
| GET | `/api/stats` | الإحصائيات |

### مثال:
```javascript
fetch('https://multibiz-salon-bot.onrender.com/api/bookings', {
  headers: { 'X-Api-Key': 'your-secret' }
}).then(r => r.json()).then(console.log);
```

---

## 🧪 اختبار محلي (قبل النشر)

```bash
# تحميل dependencies
npm install

# نسخ ملف الإعدادات
cp .env.example .env

# عدّل .env بالمعلومات ديالك
nano .env

# شغل السيرفر
npm run dev
```

افتح: `http://localhost:3000` → غتشوف صفحة الحالة.

**ملاحظة:** باش تستقبل رسائل WhatsApp محلياً، استعمل [ngrok](https://ngrok.com):
```bash
ngrok http 3000
# غيعطيك URL مؤقت — حطو ف UltraMsg كـ webhook
```

---

## ⚠️ ملاحظات مهمة

- **Render Free Tier** كيخلي الخدمة تنام بعد 15 دقيقة بلا نشاط. أول رسالة بعد النوم كتاخد ~30 ثانية. الحل: استعمل [UptimeRobot](https://uptimerobot.com) باش يبعث ping كل 5 دقائق للـ `/health`.

- **البيانات** محفوظة ف فولدر `data/` — على Render Free، البيانات كتمسح مع كل deploy. للإنتاج: استعمل [Render Disk](https://render.com/docs/disks) أو [MongoDB Atlas](https://mongodb.com/cloud) مجاناً.

- **تكلفة UltraMsg:** ~$10/شهر. إذا بغيتي بديل مجاني، شوف [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) — ولكن خاص setup معقد.

---

## 📝 الرخصة

MIT — استعمل، عدّل، وزع بحرية 🇲🇦
