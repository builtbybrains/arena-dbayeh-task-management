// Arabic for the manager screens: command center, departments, team, task
// board header and the task-assignment dialog.
export const MANAGER: Record<string, string> = {
  // Task composer
  Leadership: "الإدارة العليا",
  "Department manager": "مدير القسم",
  Team: "الفريق",
  "the team": "الفريق",
  "In 1 hour": "بعد ساعة",
  "In 3 hours": "بعد 3 ساعات",
  "End of day": "نهاية اليوم",
  "Tomorrow 10:00": "غدًا 10:00",
  "Task deployed": "تم إرسال المهمة",
  "“{title}” is now in {name}’s queue, with {time} allowed.":
    "أصبحت «{title}» الآن في قائمة {name}، والوقت المسموح {time}.",
  "Task deployment": "إرسال المهام",
  "Deploy a task": "إرسال مهمة",
  "Pick a template or write your own, choose who does it, then set the priority, the time allowed and the deadline.":
    "اختر قالبًا أو اكتب مهمتك، وحدد من سينفذها، ثم اضبط الأولوية والوقت المسموح والموعد النهائي.",
  Department: "القسم",
  Task: "المهمة",
  "What needs to be done?": "ما المطلوب إنجازه؟",
  "Short description or instructions": "وصف قصير أو تعليمات",
  "Task description": "وصف المهمة",
  "Assign to": "تعيين إلى",
  "No one in this department sits beneath your position.": "لا يوجد أحد في هذا القسم تحت منصبك.",
  "{n} open": "{n} مفتوحة",
  Priority: "الأولوية",
  "Time allowed": "الوقت المسموح",
  "Time allowed in minutes": "الوقت المسموح بالدقائق",
  minutes: "دقيقة",
  "If the task takes longer than this, the assignee and everyone above them get an alert.":
    "إذا استغرقت المهمة وقتًا أطول من ذلك، يصل تنبيه إلى المكلَّف بها وإلى كل من هم أعلى منه.",
  Due: "الموعد النهائي",
  "Due date": "تاريخ الاستحقاق",
  "Due time (Beirut)": "وقت الاستحقاق (بتوقيت بيروت)",
  "Optional: category and internal notes": "اختياري: الفئة والملاحظات الداخلية",
  "Category (for example Opening, Safety)": "الفئة (مثل الافتتاح، السلامة)",
  "Task category": "فئة المهمة",
  "Internal notes (visible to managers only)": "ملاحظات داخلية (تظهر للمدراء فقط)",
  "Internal notes": "ملاحظات داخلية",
  "{time} allowed": "الوقت المسموح {time}",
  "{priority} priority": "الأولوية: {priority}",
  Cancel: "إلغاء",
  "Deploy task": "إرسال مهمة",

  // Activity feed and attention list
  "No activity yet": "لا يوجد نشاط بعد",
  "Critical overdue": "حرجة ومتأخرة",
  Unassigned: "غير مُعيَّنة",
  "Paused too long": "متوقفة مؤقتًا لفترة طويلة",
  "Unresolved work": "عمل غير محسوم",
  Bottleneck: "اختناق في العمل",
  Escalated: "مُصعَّدة",
  "Over time allowed": "تجاوزت الوقت المسموح",
  Overdue: "متأخرة",
  "New task": "مهمة جديدة",
  "All clear": "كل شيء على ما يرام",
  "Nothing is over its time allowed, overdue or waiting on you.":
    "لا توجد مهمة تجاوزت وقتها المسموح أو متأخرة أو بانتظارك.",
  "Show fewer": "عرض أقل",
  "Show all {n}": "عرض الكل ({n})",

  // Employee card and department view
  Working: "يعمل",
  Paused: "متوقف مؤقتًا",
  "No task running": "لا توجد مهمة قيد التنفيذ",
  "Current task": "المهمة الحالية",
  "Nothing in progress": "لا شيء قيد التنفيذ",
  "Time today": "الوقت اليوم",
  "Done today": "أُنجزت اليوم",
  Remaining: "المتبقية",
  "{n} overdue": "{n} متأخرة",
  "Assign task": "تعيين مهمة",
  "Assign Task": "تعيين مهمة",
  "Demo shortcut: open this person's own screen": "اختصار تجريبي: افتح شاشة هذا الشخص",
  "See their screen": "عرض شاشته",
  Queue: "قائمة المهام",
  "No open tasks.": "لا توجد مهام مفتوحة.",
  "No access": "لا صلاحية",
  "Your role cannot open this department.": "لا يسمح دورك بفتح هذا القسم.",
  Employees: "الموظفون",
  "Active now": "نشطون الآن",
  "Assigned today": "المُعيَّنة اليوم",
  Completed: "المنجزة",
  Pending: "قيد الانتظار",
  "Managed by {name}.": "يديره {name}.",
  "Completion rate {pct}% of tasks due today · {time} active task time today.":
    "نسبة الإنجاز {pct}% من مهام اليوم · {time} من وقت العمل الفعلي على المهام اليوم.",
  "Other team members": "أعضاء الفريق الآخرون",
  "Open tasks · {n}": "المهام المفتوحة · {n}",
  "Queue is clear": "لا توجد مهام معلّقة",
  "Every task for this department is completed.": "أُنجزت كل مهام هذا القسم.",
  "Completed today · {n}": "أُنجزت اليوم · {n}",
  "Needs attention": "تحتاج إلى متابعة",
  "Department activity": "نشاط القسم",
  Waiters: "النُّدُل",
  "Working now": "يعملون الآن",
  "Open tasks": "المهام المفتوحة",
  Restaurant: "المطعم",
  "Its tasks": "مهامه",
  "Department details": "تفاصيل القسم",

  // Venue data shown on these screens
  "Quatro Restaurant": "مطعم Quatro",
  "Main dining room by the playground: international, Italian and Arabic dishes and a kids' menu.":
    "صالة الطعام الرئيسية بجانب منطقة الألعاب: أطباق عالمية وإيطالية وعربية وقائمة للأطفال.",
  "Opening, cleaning, maintenance and the daily floor.": "الافتتاح والتنظيف والصيانة وسير العمل اليومي في الصالة.",
  "Quatro restaurant: kitchen, waiters and service.": "مطعم Quatro: المطبخ والنُّدُل والخدمة.",
  "Play areas, entry desk, safety and kids' activities.": "مناطق اللعب ومكتب الدخول والسلامة وأنشطة الأطفال.",

  // Operations map
  "Loading operations map": "جارٍ تحميل خريطة العمليات",
  "{name}: {pct}% complete, {assigned} tasks today, {active} working, {overdue} overdue":
    "{name}: منجز بنسبة {pct}%، مهام اليوم {assigned}، يعمل الآن {active}، المتأخرة {overdue}",
  "{n} late": "{n} متأخرة",

  // Command center
  "Executive Command Center": "مركز القيادة التنفيذي",
  "{greeting}, {name}": "{greeting}، {name}",
  "One live view of every department: who is working, what is done, and what needs you.":
    "عرض مباشر واحد لكل الأقسام: من يعمل، وما الذي أُنجز، وما الذي يحتاج إليك.",
  "Total employees": "إجمالي الموظفين",
  "across {n} departments": "في جميع الأقسام ({n})",
  "with a task timer running": "مؤقت المهمة لديهم قيد التشغيل",
  "Tasks assigned today": "المهام المُعيَّنة اليوم",
  "due today": "مستحقة اليوم",
  "In progress": "قيد التنفيذ",
  "running right now": "قيد التشغيل الآن",
  "of today's tasks": "من مهام اليوم",
  "{n} from earlier days · open the list": "{n} من أيام سابقة · افتح القائمة",
  "past deadline · open the list": "تجاوزت الموعد النهائي · افتح القائمة",
  "Completion rate": "نسبة الإنجاز",
  "completed ÷ assigned today": "المنجزة ÷ المُعيَّنة اليوم",
  "Tracked time": "الوقت المسجَّل",
  "active task time today": "وقت العمل الفعلي على المهام اليوم",
  "Arena operations map": "خريطة عمليات Arena",
  "No overdue": "لا متأخرات",
  "1-2 overdue": "1-2 متأخرة",
  "3+ overdue": "3+ متأخرة",
  "Select a department to open its tasks, people and performance. Node size shows today’s workload, the arc shows completion, moving dots show people working.":
    "اختر قسمًا لفتح مهامه وأفراده وأدائه. يدل حجم العقدة على حجم عمل اليوم، والقوس على نسبة الإنجاز، والنقاط المتحركة على الأشخاص الذين يعملون.",
  "Live activity": "النشاط المباشر",
  Live: "مباشر",
  "Departments today": "الأقسام اليوم",
  "{n} working": "{n} يعملون",

  // Departments page
  Departments: "الأقسام",
  "One venue, every team": "مكان واحد، وكل الفرق",
  "Today's progress in each department. Open one to see its people, queue and activity.":
    "تقدّم اليوم في كل قسم. افتح أي قسم لترى أفراده وقائمة مهامه ونشاطه.",
  "{n} waiters": "النُّدُل: {n}",
  Assigned: "المُعيَّنة",
  Done: "المنجزة",

  // My department page
  "No department": "لا يوجد قسم",
  "This profile is not attached to a department.": "هذا الملف الشخصي غير مرتبط بأي قسم.",

  // Tasks page
  "All Tasks": "كل المهام",
  "Every task, by priority": "كل المهام حسب الأولوية",
  "Hand work to the Operations Manager, or assign anyone directly.":
    "سلّم العمل إلى مدير العمليات، أو عيّن أي شخص مباشرة.",
  "Assign. Prioritise. Track.": "عيّن. رتّب الأولويات. تابع.",
  "Pass tasks on to the managers and staff, reassign and reprioritise in one place.":
    "مرّر المهام إلى المدراء والموظفين، وأعد التعيين وغيّر الأولويات من مكان واحد.",
  "Assign Tasks": "تعيين المهام",
  "Your team's queue": "قائمة مهام فريقك",
  "Assign tasks to your team, set priorities and follow them to completion.":
    "عيّن المهام لفريقك، وحدد الأولويات، وتابعها حتى الإنجاز.",
  Tasks: "المهام",

  // Team page
  Everyone: "الجميع",
  "Has overdue tasks": "لديه مهام متأخرة",
  "People and PINs": "الأشخاص ورموز PIN",
  "Who is doing what, right now": "من يفعل ماذا، الآن",
  "Add the team, give each person a position, a department and a PIN to sign in with.":
    "أضف الفريق، وامنح كل شخص منصبًا وقسمًا ورمز PIN لتسجيل الدخول.",
  "Live status for each person, their queue and what they are working on.":
    "الحالة المباشرة لكل شخص، وقائمة مهامه، وما يعمل عليه.",
  "Live status": "الحالة المباشرة",
  "Filter by status": "التصفية حسب الحالة",
  "Filter by department": "التصفية حسب القسم",
  "All departments": "كل الأقسام",
  "Search by name or role": "ابحث بالاسم أو الوظيفة",
  "Search people": "البحث عن الأشخاص",
  "{n} person": "شخص واحد",
  "{n} people": "عدد الأشخاص: {n}",
  "No one matches": "لا توجد نتائج مطابقة",
  "Try another status or clear the search.": "جرّب حالة أخرى أو امسح البحث.",
};
