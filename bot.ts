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
  selectedChats?: number[]; // Массив ID выбранных чатов
  step?: "awaiting_chats" | "awaiting_title";
}
const userSessions: Record<number, UserSession> = {};

// --- Логирование добавления бота в группы/каналы ---
bot.on("my_chat_member", async (ctx) => {
  const chat = ctx.myChatMember.chat;
  const status = ctx.myChatMember.new_chat_member.status;

  // Если бота добавили в группу или сделали администратором канала
  if (status === "member" || status === "administrator") {
    const title = "title" in chat ? chat.title : "Канал/Группа";
    try {
      await db.execute(
        "INSERT INTO chats (chat_id, chat_title) VALUES (?, ?) ON DUPLICATE KEY UPDATE chat_title = ?",
        [chat.id, title, title],
      );
      console.log(`[DB] Бот добавлен в чат: ${title} (${chat.id})`);
    } catch (err) {
      console.error("Ошибка сохранения чата:", err);
    }
  }
  // Если бота удалили из чата
  else if (status === "left" || status === "kicked") {
    try {
      await db.execute("DELETE FROM chats WHERE chat_id = ?", [chat.id]);
      console.log(`[DB] Бот удален из чата: (${chat.id})`);
    } catch (err) {
      console.error("Ошибка удаления чата:", err);
    }
  }
});

// --- Клавиатуры ---
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

// Генератор меню выбора чатов с динамическими галочками ✅
function createChatsKeyboard(availableChats: any[], selectedIds: number[]) {
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

// --- Команды ---
bot.start((ctx) =>
  ctx.reply(
    "Привет! Используй /add в ЛИЧНЫХ сообщениях бота для создания напоминаний.",
  ),
);

bot.command("add", (ctx) => {
  if (ctx.chat.type !== "private") {
    return ctx.reply(
      "⚠️ Настраивать события можно только в личном чате с ботом.",
    );
  }
  const userId = ctx.from.id;
  userSessions[userId] = { selectedChats: [] };
  ctx.reply("Шаг 1/4: Выбери дату:", createCalendarKeyboard());
});

bot.action(/^date:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  if (userSessions[userId]) userSessions[userId].selectedDate = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Дата выбрана.\n\nШаг 2/4: Выбери час (МСК):`,
    createHoursKeyboard(),
  );
});

bot.action(/^hour:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Час выбран.\n\nШаг 2/4: Уточни минуты:`,
    createMinutesKeyboard(ctx.match[1]),
  );
});

// Переход к выбору чатов
bot.action(/^time:(.+):(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  if (userSessions[userId]) {
    userSessions[userId].selectedTime = `${ctx.match[1]}:${ctx.match[2]}`;
    userSessions[userId].step = "awaiting_chats";
  }
  await ctx.answerCbQuery();

  // Достаем из БД чаты, где состоит бот
  const [chats]: [any[], any] = await db.execute(
    "SELECT chat_id, chat_title FROM chats",
  );
  await ctx.editMessageText(
    `Время выбрано.\n\nШаг 3/4: Выбери группы/каналы для отправки дубликата (помимо лички):`,
    createChatsKeyboard(chats, userSessions[userId].selectedChats || []),
  );
});

// Переключение галочки у чата
bot.action(/^toggle_chat:(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !ctx.match) return;
  const chatId = Number(ctx.match[1]);
  const session = userSessions[userId];

  if (session && session.selectedChats) {
    if (session.selectedChats.includes(chatId)) {
      session.selectedChats = session.selectedChats.filter(
        (id) => id !== chatId,
      );
    } else {
      session.selectedChats.push(chatId);
    }
    await ctx.answerCbQuery();
    const [chats]: [any[], any] = await db.execute(
      "SELECT chat_id, chat_title FROM chats",
    );
    await ctx.editMessageReplyMarkup(
      createChatsKeyboard(chats, session.selectedChats).reply_markup,
    );
  }
});

// Подтверждение выбора чатов
bot.action("confirm_chats", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  if (userSessions[userId]) userSessions[userId].step = "awaiting_title";
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Чаты зафиксированы.\n\nШаг 4/4: Отправь название события текстом.`,
  );
});

bot.action("ignore", async (ctx) => await ctx.answerCbQuery());

// Сохранение названия и запись в MySQL
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
    // Превращаем массив ID чатов в строку через запятую
    const targetChatsStr = (session.selectedChats || []).join(",");

    try {
      await db.execute(
        "INSERT INTO events (user_id, event_title, event_date, target_chats) VALUES (?, ?, ?, ?)",
        [userId, eventTitle, fullDateTime, targetChatsStr],
      );
      ctx.reply(
        `✅ Событие успешно создано! Напоминание придет вам в личку и во все выбранные каналы.`,
      );
      delete userSessions[userId];
    } catch (error) {
      ctx.reply("❌ Ошибка записи в базу данных.");
    }
  } else {
    return next();
  }
});

// --- КРОН С МУЛЬТИ-ОТПРАВКОЙ ---
cron.schedule("* * * * *", async () => {
  const now = new Date();
  now.setHours(now.getHours() + 3);
  const currentCheckTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
  console.log("now", now);
  console.log("currentCheckTime", currentCheckTime);
  const [rows1]: [any[], any] = await db.execute(
    "SELECT id, user_id, event_title, target_chats, event_date FROM events",
  );
  console.log("rows1", rows1);
  try {
    const [rows]: [any[], any] = await db.execute(
      "SELECT id, user_id, event_title, target_chats FROM events WHERE event_date = ?",
      [currentCheckTime],
    );

    for (const event of rows) {
      console.log("event.event_date", event.event_date);
      // 1. Уведомление создателю в личку
      try {
        await bot.telegram.sendMessage(
          event.user_id,
          `⏰ **НАПОМИНАНИЕ!**\n👉 **${event.event_title}**`,
          { parse_mode: "Markdown" },
        );
      } catch (e) {
        console.error("Не смогли отправить создателю:", e);
      }

      // 2. Уведомление в выбранные группы/каналы
      if (event.target_chats) {
        const chatIds = event.target_chats.split(",").map(Number);
        for (const chatId of chatIds) {
          try {
            await bot.telegram.sendMessage(
              chatId,
              `📢 **Внимание, напоминание для чата!**\n📌 Событие: **${event.event_title}**`,
              { parse_mode: "Markdown" },
            );
          } catch (chatErr) {
            console.error(`Не смогли отправить в чат ${chatId}:`, chatErr);
          }
        }
      }
      // Удаляем после отправки
      await db.execute("DELETE FROM events WHERE id = ?", [event.id]);
    }
  } catch (dbError) {
    console.error(dbError);
  }
});

bot.launch().then(() => console.log("Мульти-чат Бот запущен!"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
