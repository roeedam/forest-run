# Forest Run

פרויקט המשחק "Forest Run" - קוד המשחק (www/), פרויקט Android/Capacitor (android/), ותהליך בנייה אוטומטי ל-APK דרך GitHub Actions (.github/workflows/build-android.yml).

## איך מקבלים קובץ APK להתקנה על אנדרואיד (חד פעמי, בלי כתיבת קוד)

1. **פתח חשבון GitHub חינמי** (אם עוד אין לך) בכתובת github.com.
2. **צור repository חדש וריק** (New repository) - תן לו שם כמו `forest-run`, בלי לסמן "Add a README".
3. **התקן את GitHub Desktop** (חינמי, ללא שימוש בשורת פקודה) מהכתובת desktop.github.com, והתחבר עם חשבון ה-GitHub שלך.
4. ב-GitHub Desktop: **Clone** את ה-repository הריק שיצרת למחשב שלך (בחר תיקייה כלשהי).
5. **פרוס (unzip)** את הקובץ שקיבלת ממני, והעתק **את כל התוכן** (כולל התיקייה המוסתרת `.github`) לתוך תיקיית ה-repository שכובר-שיבטת. אם אתה לא רואה את `.github` בסייר הקבצים - צריך להפעיל "הצג פריטים מוסתרים" (Show hidden items).
6. חזור ל-GitHub Desktop - תראה רשימה ארוכה של קבצים חדשים. כתוב הודעת קומיט כלשהי (למשל "התחלה") ולחץ **Commit to main**, ואז **Push origin**.
7. עבור לאתר GitHub, לתוך ה-repository שלך, ולחץ על לשונית **Actions**. תראה ריצה בשם "Build Android APK" מתבצעת (לוקח כ-3-5 דקות).
8. כשהריצה מסתיימת (עיגול ירוק ✓), היכנס אליה, גלול למטה ל-**Artifacts**, והורד את `forest-run-debug-apk` (קובץ zip שבתוכו `app-debug.apk`).
9. העבר את קובץ ה-APK לטלפון האנדרואיד (למשל שלח לעצמך במייל או דרך Google Drive), ולחץ עליו כדי להתקין. בפעם הראשונה אנדרואיד יבקש לאשר "התקנה ממקורות לא ידועים" - זה תקין, זה קורה לכל אפליקציה שלא מותקנת מ-Google Play.

מרגע זה, כל פעם שיתעדכן קוד המשחק ותעשה Push חדש מ-GitHub Desktop, ריצת ה-Actions תיצור אוטומטית APK מעודכן באותו מקום.

## מבנה הפרויקט
- `www/` - קוד המשחק עצמו (HTML/CSS/JS + כל הגרפיקה האמיתית).
- `android/` - פרויקט Android/Gradle שנוצר ע"י Capacitor, עוטף את קוד המשחק לאפליקציה מותקנת.
- `.github/workflows/build-android.yml` - הגדרת הבנייה האוטומטית שרצה בענן של GitHub בכל Push.
