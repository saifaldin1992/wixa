# إيميلات تسجيل الدخول بالعربي (Supabase)

> **طُبّقت على الموقع الرئيسي في 14 نوفمبر 2026** عبر Management API، وحُفظت القوالب القديمة احتياطاً. النسخة التجريبية تستعمل بريد Supabase الافتراضي (المجاني)، فلا يمكن تغيير قوالبها إلا بعد ربطها بـ SMTP خاص.
>
> ملاحظة: دعوة شخص إلى الفريق من اللوحة تجعله ينشئ حسابه بنفسه (signUp)، فيصله قالب **Confirm signup** لا **Invite user**. لهذا يجب أن يبقى «السماح بإنشاء الحسابات» مفعّلاً في Supabase، والصلاحيات تُمنح فقط برمز الدعوة.

## أين تُلصق
1. افتح لوحة Supabase واختر مشروع الموقع الرئيسي (`sdtsoppvyogdfamotrvx`). كرّر الخطوات لاحقاً للنسخة التجريبية إن أردت.
2. ادخل إلى **Authentication ← Emails ← Templates**.
3. لكل قالب أدناه:
   1. انسخ **الموضوع** إلى خانة **Subject**.
   2. امسح كل ما في خانة **Message body**، ثم الصق كود الرسالة.
   3. اضغط **Save**.

لا تغيّر ما بين القوسين المزدوجين، مثل `{{ .ConfirmationURL }}`. Supabase يضع مكانها الرابط أو الرمز الحقيقي عند الإرسال.

| القالب في Supabase | متى يُرسل |
|---|---|
| Invite user | عند دعوة شخص إلى فريق لوحة التحكم |
| Reset password | عند «نسيت كلمة المرور» |
| Change email address | عند تغيير البريد من صفحة الحساب |
| Reauthentication | رمز تأكيد قبل تغيير كلمة المرور أو إعدادات الأمان |
| Magic link | رابط دخول بدون كلمة مرور (إن استُعمل) |
| Confirm signup | تأكيد حساب جديد (إن فُتح التسجيل يوماً) |

---

## 1) Invite user — دعوة إلى فريق لوحة التحكم

**الموضوع:**
```
دعوة للانضمام إلى لوحة تحكم ويكسا
```

**الرسالة:**
```html
<div dir="rtl" style="font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;background:#F5F5F7;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2">
    <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">ويكسا</div>
    <div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.9">
      <p style="margin:0 0 12px">أهلاً،</p>
      <p style="margin:0 0 12px">تمت دعوتك للانضمام إلى فريق لوحة تحكم موقع ويكسا. اضغط الزر لقبول الدعوة واختيار كلمة المرور الخاصة بك.</p>
      <p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">قبول الدعوة</a></p>
      <p style="margin:0;color:#625C70;font-size:13px">إذا لم تكن تتوقع هذه الدعوة يمكنك تجاهل هذه الرسالة.</p>
    </div>
  </div>
</div>
```

---

## 2) Reset password — استعادة كلمة المرور

**الموضوع:**
```
إعادة تعيين كلمة المرور — ويكسا
```

**الرسالة:**
```html
<div dir="rtl" style="font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;background:#F5F5F7;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2">
    <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">ويكسا</div>
    <div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.9">
      <p style="margin:0 0 12px">أهلاً،</p>
      <p style="margin:0 0 12px">وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في لوحة تحكم ويكسا. اضغط الزر لاختيار كلمة مرور جديدة.</p>
      <p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">اختيار كلمة مرور جديدة</a></p>
      <p style="margin:0;color:#625C70;font-size:13px">إذا لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة مرورك كما هي.</p>
    </div>
  </div>
</div>
```

---

## 3) Change email address — تغيير البريد الإلكتروني

**الموضوع:**
```
تأكيد تغيير البريد الإلكتروني — ويكسا
```

**الرسالة:**
```html
<div dir="rtl" style="font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;background:#F5F5F7;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2">
    <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">ويكسا</div>
    <div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.9">
      <p style="margin:0 0 12px">أهلاً،</p>
      <p style="margin:0 0 12px">طُلب تغيير البريد الإلكتروني لحسابك في لوحة تحكم ويكسا من <b dir="ltr">{{ .Email }}</b> إلى <b dir="ltr">{{ .NewEmail }}</b>. اضغط الزر لتأكيد التغيير.</p>
      <p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">تأكيد البريد الجديد</a></p>
      <p style="margin:0;color:#625C70;font-size:13px">إذا لم تطلب هذا التغيير فلا تضغط الزر، وغيّر كلمة مرورك من صفحة الحساب.</p>
    </div>
  </div>
</div>
```

---

## 4) Reauthentication — رمز التأكيد

**الموضوع:**
```
رمز التأكيد الخاص بك — ويكسا
```

**الرسالة:**
```html
<div dir="rtl" style="font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;background:#F5F5F7;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2">
    <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">ويكسا</div>
    <div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.9">
      <p style="margin:0 0 12px">أهلاً،</p>
      <p style="margin:0 0 12px">استخدم هذا الرمز لتأكيد العملية في لوحة تحكم ويكسا:</p>
      <div style="background:#F3EEFC;border-radius:12px;padding:14px;text-align:center;margin:0 0 16px"><span style="font-size:26px;font-weight:bold;letter-spacing:6px;color:#5B21B6" dir="ltr">{{ .Token }}</span></div>
      <p style="margin:0;color:#625C70;font-size:13px">لا تشارك هذا الرمز مع أحد. إذا لم تطلبه فتجاهل هذه الرسالة.</p>
    </div>
  </div>
</div>
```

---

## 5) Magic link — رابط الدخول

**الموضوع:**
```
رابط الدخول إلى لوحة تحكم ويكسا
```

**الرسالة:**
```html
<div dir="rtl" style="font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;background:#F5F5F7;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2">
    <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">ويكسا</div>
    <div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.9">
      <p style="margin:0 0 12px">أهلاً،</p>
      <p style="margin:0 0 12px">اضغط الزر للدخول إلى لوحة تحكم ويكسا. الرابط صالح لمرة واحدة ولفترة قصيرة.</p>
      <p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">الدخول إلى اللوحة</a></p>
      <p style="margin:0;color:#625C70;font-size:13px">إذا لم تطلب الدخول فتجاهل هذه الرسالة.</p>
    </div>
  </div>
</div>
```

---

## 6) Confirm signup — تأكيد الحساب

**الموضوع:**
```
تأكيد بريدك الإلكتروني — ويكسا
```

**الرسالة:**
```html
<div dir="rtl" style="font-family:'Noto Sans Arabic',Tahoma,Arial,sans-serif;background:#F5F5F7;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E9E4F2">
    <div style="background:#5B21B6;color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">ويكسا</div>
    <div style="padding:22px;color:#140F1F;font-size:15px;line-height:1.9">
      <p style="margin:0 0 12px">أهلاً،</p>
      <p style="margin:0 0 12px">شكراً لتسجيلك. اضغط الزر لتأكيد بريدك الإلكتروني وتفعيل حسابك.</p>
      <p style="margin:18px 0"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#5B21B6;color:#fff;padding:12px 24px;border-radius:99px;text-decoration:none;font-weight:bold">تأكيد البريد</a></p>
      <p style="margin:0;color:#625C70;font-size:13px">إذا لم تنشئ حساباً فتجاهل هذه الرسالة.</p>
    </div>
  </div>
</div>
```

---

## بعد الحفظ
جرّب «نسيت كلمة المرور» من صفحة دخول لوحة التحكم ببريدك، وتأكد أن الرسالة تصل بالعربي. اسم المرسل يُضبط من **Authentication ← Emails ← SMTP Settings ← Sender name**، ونقترح أن يكون «ويكسا».
