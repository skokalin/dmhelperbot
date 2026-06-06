import { Telegraf, Context, Markup } from "telegraf";
import mysql from "mysql2/promise";
import cron from "node-cron";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Ошибка: Переменная env BOT_TOKEN не задана!");
  process.exit(1);
}

const db = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "bot_user",
  password: process.env.DB_PASSWORD || "bot_password",
  database: process.env.DB_NAME || "calendar_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const bot = new Telegraf<Context>(token);

interface UserSession {
  selectedDate?: string;
  selectedTime?: string;
  step?: "awaiting_time_hour" | "awaiting_time_minute" | "awaiting_title";
}
const userSessions: Record<number, UserSession> = {};

// --- Интерфейс календаря и времени ---
function createCalendarKeyboard() {
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

function createHoursKeyboard() {
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

function createMinutesKeyboard(hour: string) {
  const minutes = ["00", "15", "30", "45"];
  const row = minutes.map((min) =>
    Markup.button.callback(`${hour}:${min}`, `time:${hour}:${min}`),
  );
  return Markup.inlineKeyboard([row]);
}

// --- Команды бота ---
bot.start((ctx) => {
  ctx.reply(
    "Привет! Я твой МСК бот-календарь с напоминаниями.\n\n" +
      "📅 /add — запланировать событие\n" +
      "📋 /list — список и управление событиями",
  );
});

bot.command("add", (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  userSessions[userId] = {};
  ctx.reply("Шаг 1/3: Выбери дату:", createCalendarKeyboard());
});

bot.command("list", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const [rows]: [any[], any] = await db.execute(
      "SELECT id, event_title, event_date FROM events WHERE user_id = ? ORDER BY event_date ASC",
      [userId],
    );

    if (rows.length === 0) {
      return ctx.reply("📭 У вас пока нет запланированных событий.");
    }

    await ctx.reply("📋 **Ваши запланированные события:**", {
      parse_mode: "Markdown",
    });

    for (const event of rows) {
      const dateObj = new Date(event.event_date);
      const day = String(dateObj.getDate()).padStart(2, "0");
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const hours = String(dateObj.getHours()).padStart(2, "0");
      const minutes = String(dateObj.getMinutes()).padStart(2, "0");

      const messageText = `📌 **${event.event_title}**\n📅 ${day}.${month}.${dateObj.getFullYear()} в ${hours}:${minutes} (МСК)`;

      await ctx.reply(messageText, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          Markup.button.callback("❌ Удалить", `delete:${event.id}`),
        ]),
      });
    }
  } catch (error) {
    console.error(error);
    ctx.reply("❌ Не удалось получить список.");
  }
});

// --- Обработка инлайн-кнопок (с фиксом типов) ---
bot.action(/^date:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  const selectedDate = ctx.match[1]; // Фикс RegExpExecArray

  userSessions[userId] = { selectedDate, step: "awaiting_time_hour" };
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Выбрана дата: ${selectedDate}\n\nШаг 2/3: Выбери час (МСК):`,
    createHoursKeyboard(),
  );
});

bot.action(/^hour:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  const hour = ctx.match[1]; // Фикс RegExpExecArray

  if (userSessions[userId]) userSessions[userId].step = "awaiting_time_minute";
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Выбран час: ${hour}:00\n\nШаг 2/3: Уточни минуты:`,
    createMinutesKeyboard(hour),
  );
});

bot.action(/^time:(.+):(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  const hour = ctx.match[1]; // Фикс RegExpExecArray
  const minute = ctx.match[2]; // Фикс RegExpExecArray
  const fullTime = `${hour}:${minute}`;

  if (userSessions[userId]) {
    userSessions[userId].selectedTime = fullTime;
    userSessions[userId].step = "awaiting_title";
  }
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Дата: ${userSessions[userId]?.selectedDate}\nВремя: ${fullTime} (МСК)\n\nШаг 3/3: Отправь название события.`,
  );
});

bot.action(/^delete:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  const eventId = ctx.match[1];

  try {
    const [result]: any = await db.execute(
      "DELETE FROM events WHERE id = ? AND user_id = ?",
      [eventId, userId],
    );
    await ctx.answerCbQuery("Событие удалено!");
    if (result.affectedRows > 0) await ctx.deleteMessage();
  } catch (error) {
    await ctx.answerCbQuery("Ошибка при удалении");
  }
});

bot.action("ignore", async (ctx) => await ctx.answerCbQuery());

// --- Прием текста ---
bot.on("text", async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  const session = userSessions[userId];

  if (
    session &&
    session.step === "awaiting_title" &&
    session.selectedDate &&
    session.selectedTime
  ) {
    const eventTitle = ctx.message.text.trim();
    const fullDateTime = `${session.selectedDate} ${session.selectedTime}:00`;

    try {
      await db.execute(
        "INSERT INTO events (user_id, event_title, event_date) VALUES (?, ?, ?)",
        [userId, eventTitle, fullDateTime],
      );
      ctx.reply(
        `✅ Событие добавлено!\n📌 ${eventTitle}\n📅 ${session.selectedDate} в ${session.selectedTime} (МСК)`,
      );
      delete userSessions[userId];
    } catch (error) {
      ctx.reply("❌ Ошибка записи в базу данных.");
    }
  } else {
    return next();
  }
});

// --- CRON JOB: НАПОМИНАНИЯ КАЖДУЮ МИНУТУ ---
cron.schedule("* * * * *", async () => {
  const now = new Date();

  // Форматируем текущее Московское время под формат DATETIME в MySQL
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");

  const currentCheckTime = `${year}-${month}-${day} ${hour}:${minute}:00`;

  try {
    // Выбираем события, время которых наступило прямо сейчас
    const [rows]: [any[], any] = await db.execute(
      "SELECT id, user_id, event_title FROM events WHERE event_date = ?",
      [currentCheckTime],
    );

    for (const event of rows) {
      try {
        await bot.telegram.sendMessage(
          event.user_id,
          `⏰ **НАПОМИНАНИЕ!**\n\n🔔 Наступило запланированное событие:\n👉 **${event.event_title}**`,
          { parse_mode: "Markdown" },
        );
        // Удаляем событие после отправки уведомления
        await db.execute("DELETE FROM events WHERE id = ?", [event.id]);
      } catch (tgError) {
        console.error(
          `Ошибка отправки пользователю ${event.user_id}:`,
          tgError,
        );
      }
    }
  } catch (dbError) {
    console.error("Ошибка выполнения Cron в БД:", dbError);
  }
});

bot.launch().then(() => console.log("Бот-календарь с Кроном успешно запущен!"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
