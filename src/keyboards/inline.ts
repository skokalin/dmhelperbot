import { Markup } from "telegraf";

export function createCalendarKeyboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthNames = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
  ];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const buttons = [];

  buttons.push([
    Markup.button.callback(`${monthNames[month]} ${year}`, "ignore"),
  ]);
  buttons.push(
    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) =>
      Markup.button.callback(d, "ignore"),
    ),
  );

  let firstDayIndex = new Date(year, month, 1).getDay();
  firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  let currentWeek: any[] = [];
  for (let i = 0; i < firstDayIndex; i++)
    currentWeek.push(Markup.button.callback(" ", "ignore"));

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const monthStr = String(month + 1).padStart(2, "0");
    currentWeek.push(
      Markup.button.callback(String(day), `date:${year}-${monthStr}-${dayStr}`),
    );
    if (currentWeek.length === 7) {
      buttons.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7)
      currentWeek.push(Markup.button.callback(" ", "ignore"));
    buttons.push(currentWeek);
  }
  return Markup.inlineKeyboard(buttons);
}

export function createHoursKeyboard() {
  const buttons = [];
  let row = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourStr = String(hour).padStart(2, "0");
    row.push(Markup.button.callback(`${hourStr}:00`, `hour:${hourStr}`));
    if (row.length === 6) {
      buttons.push(row);
      row = [];
    }
  }
  return Markup.inlineKeyboard(buttons);
}

export function createMinutesKeyboard(hour: string) {
  const minutes = ["00", "15", "30", "45"];
  const row = minutes.map((min) =>
    Markup.button.callback(`${hour}:${min}`, `time:${hour}:${min}`),
  );
  return Markup.inlineKeyboard([row]);
}

export function createChatsKeyboard(
  availableChats: any[],
  selectedIds: number[],
) {
  const buttons = [];
  for (const chat of availableChats) {
    const isSelected = selectedIds.includes(Number(chat.chat_id));
    const prefix = isSelected ? "✅ " : "⬜ ";
    buttons.push([
      Markup.button.callback(
        `${prefix}${chat.chat_title}`,
        `toggle_chat:${chat.chat_id}`,
      ),
    ]);
  }
  buttons.push([
    Markup.button.callback("➡️ Подтвердить выбор чатов", "confirm_chats"),
  ]);
  return Markup.inlineKeyboard(buttons);
}

// Расширенный список интервалов по аналогии с Google Календарем
export const REMINDER_OPTIONS = [
  { id: "exact", label: "⏱ В момент начала", ms: 0 },
  { id: "5m", label: "⏳ За 5 минут", ms: 5 * 60 * 1000 },
  { id: "15m", label: "⏳ За 15 минут", ms: 15 * 60 * 1000 },
  { id: "30m", label: "⏳ За 30 минут", ms: 30 * 60 * 1000 },
  { id: "1h", label: "⏰ За 1 час", ms: 60 * 60 * 1000 },
  { id: "2h", label: "⏰ За 2 часа", ms: 2 * 60 * 60 * 1000 },
  { id: "1d", label: "📅 За 1 день", ms: 24 * 60 * 60 * 1000 },
  { id: "2d", label: "📅 За 2 дня", ms: 2 * 24 * 60 * 60 * 1000 },
  { id: "1w", label: "🗓 За 1 неделю", ms: 7 * 24 * 60 * 60 * 1000 },
];

export function createRemindersKeyboard(selectedOptions: string[]) {
  const buttons = [];
  let currentRow = [];

  for (const option of REMINDER_OPTIONS) {
    const isSelected = selectedOptions.includes(option.id);
    const prefix = isSelected ? "✅ " : "⬜ ";

    // Формируем кнопку
    currentRow.push(
      Markup.button.callback(
        `${prefix}${option.label}`,
        `toggle_reminder:${option.id}`,
      ),
    );

    // Разделяем кнопки на сетку: по 2 штуки в строке
    if (currentRow.length === 2) {
      buttons.push(currentRow);
      currentRow = [];
    }
  }

  // Добавляем оставшуюся кнопку, если общее количество нечетное
  if (currentRow.length > 0) {
    buttons.push(currentRow);
  }

  // Кнопка подтверждения во всю ширину в самом низу
  buttons.push([
    Markup.button.callback(
      "➡️ Далее: Управление регулярностью",
      "confirm_reminders",
    ),
  ]);

  return Markup.inlineKeyboard(buttons);
}

export const RECURRENCE_OPTIONS = [
  { id: "none", label: "❌ Не повторять" },
  { id: "daily", label: "🔄 Каждый день" },
  { id: "weekly", label: "🔄 Каждую неделю" },
  { id: "monthly", label: "🔄 Каждый месяц" },
  { id: "yearly", label: "🔄 Каждый год" },
];

export function createRecurrenceKeyboard() {
  const buttons = RECURRENCE_OPTIONS.map((opt) => [
    Markup.button.callback(opt.label, `set_recurrence:${opt.id}`),
  ]);
  return Markup.inlineKeyboard(buttons);
}
