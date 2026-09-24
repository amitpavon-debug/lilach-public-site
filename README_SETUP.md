# אתר תדמית – לילך פבון V7

## מה השתנה ב-V7
- הוסרה לחלוטין האפשרות **"רוצה לדבר עם לילך"** וטופס השארת הפרטים הנפרד.
- פרטים אישיים נמסרים **רק בתוך תהליך קביעת פגישת האינטק**.
- נוספה הסכמה חובה לפרטיות.
- נוספה הסכמה חובה בנוסח:
  **"הנני מבינ/ה שלא ניתן לשנות תור בטווח 24 שעות מהמועד, כל שינוי בטווח זה יגרור תשלום של 150 ש"ח."**
- בתחתית האתר מופיעה הכתובת: **הכישור 30, חולון**.
- לאחר אימות תשלום הפגישה עדיין אינה מאושרת סופית: לילך מקבלת **מייל + WhatsApp** עם בקשה לאשר.
- רק לאחר שלילך מאשרת נוצרת הפגישה ביומן ונשלחת לפונה **הודעת WhatsApp** שהפגישה והתשלום אושרו.

## הזרימה המלאה
1. הפונה בוחר/ת יום ושעה.
2. ממלא/ת שם, טלפון, אימייל אופציונלי, סיבת פנייה ומקור הגעה.
3. מסמן/ת הסכמת פרטיות ואת מדיניות 24 השעות.
4. `booking-hold` בודק שהמועד פנוי ושומר אותו זמנית.
5. הפונה משלים/ה תשלום אצל ספק הסליקה.
6. **רק webhook מאומת של ספק התשלום** מפעיל את `payment-confirmed`.
7. `payment-confirmed` מעביר את הסטטוס ל-`awaiting_approval` ושולח ללילך:
   - מייל עם כל פרטי הפנייה וכפתור אישור.
   - הודעת WhatsApp עם פרטי הפגישה וקישור אישור.
8. לילך לוחצת על קישור האישור.
9. `approve-booking` בודק שוב שהמועד פנוי, יוצר אירוע ב-Google Calendar ומסמן `confirmed`.
10. הפונה מקבל/ת WhatsApp: הפגישה והתשלום אושרו. אם נמסר אימייל, נשלח גם מייל אישור.

## מצב תצוגה
כאשר `DEMO_BOOKING: true`, אפשר לעבור את כל הזרימה ללא שירותים חיצוניים:
- "הדמיית תשלום מוצלח"
- לאחר מכן "הדמיית אישור לילך"
- ורק אז מוצג אישור הפגישה הסופי.

## בסיס נתונים
הריצו פעם אחת ב-Supabase SQL Editor:

`supabase/booking_schema.sql`

הטבלה `intake_bookings` שומרת את ה-hold, סטטוס התשלום, סטטוס האישור, אישור מדיניות 24 השעות ו-ID של האירוע ביומן.

## Edge Functions
יש לפרוס את הפונקציות:
- `calendar-availability`
- `booking-hold`
- `booking-status`
- `payment-confirmed`
- `approve-booking`

`book-intake` הישן מבוטל בכוונה כדי שלא יהיה ניתן לקבוע פגישה לפני תשלום ואישור לילך.

## Secrets נדרשים ב-Supabase
### Google Calendar
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `INTAKE_DURATION_MINUTES`
- `INTAKE_WORKDAYS`
- `INTAKE_START_HOUR`
- `INTAKE_END_HOUR`

### מייל – Resend
- `RESEND_API_KEY`
- `BOOKING_EMAIL_FROM`
- `LILACH_NOTIFICATION_EMAIL`

### WhatsApp Cloud API (Meta)
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `LILACH_WHATSAPP_NUMBER` – מספרה של לילך בפורמט בינלאומי, לדוגמה `9725...`
- `WHATSAPP_LILACH_APPROVAL_TEMPLATE` – ברירת מחדל: `lilach_booking_approval`
- `WHATSAPP_CLIENT_CONFIRMED_TEMPLATE` – ברירת מחדל: `client_booking_confirmed`

הודעות יזומות ב-WhatsApp דורשות **תבניות מאושרות ב-Meta**. בקוד הוגדרו הפרמטרים הבאים:

`lilach_booking_approval`:
1. שם הפונה
2. תאריך
3. שעה
4. טלפון
5. סיבת פנייה
6. מקור הגעה
7. קישור אישור

`client_booking_confirmed`:
1. שם פרטי
2. תאריך
3. שעה
4. כתובת – הכישור 30, חולון

### אבטחת webhook תשלום
- `PAYMENT_WEBHOOK_SECRET`

ספק הסליקה צריך לאמת את העסקה/חתימת ה-webhook בצד השרת ורק אז לקרוא ל-`payment-confirmed` עם header:

`x-payment-webhook-secret: <PAYMENT_WEBHOOK_SECRET>`

אין להסתמך על חזרה של המשתמש ל-`success_url` כהוכחה לתשלום.

### קישור אישור לילך
אופציונלי:
- `APPROVE_BOOKING_PUBLIC_URL`

אם לא מוגדר, הקוד משתמש אוטומטית בכתובת פונקציית `approve-booking` של פרויקט Supabase.

### תשלום
- `CARD_PAYMENT_URL_TEMPLATE`
- `PAYBOX_URL_TEMPLATE`

אפשר להשתמש ב-`{booking_id}` וב-`{return_url}` בתבנית. בפועל מומלץ שספק הסליקה ייצור URL ייחודי לעסקה בצד השרת.

## config.js באתר
לאחר פריסת הפונקציות עדכנו רק את שלוש הכתובות הציבוריות:
- `BOOKING_AVAILABILITY_URL`
- `BOOKING_HOLD_URL`
- `BOOKING_STATUS_URL`

לא מכניסים ל-`config.js` מפתחות סודיים.

## הערה על PayBox והעברה בנקאית
אם אמצעי התשלום לא מספק API/webhook לאימות אוטומטי, הסטטוס חייב להישאר בהמתנה עד שאימות התשלום מתבצע בצד השרת/ידנית. רק אז שולחים ללילך את בקשת האישור.
