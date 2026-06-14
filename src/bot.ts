import { Telegraf, Context } from "telegraf";
import { db } from "./config/db";
import { initCron } from "./services/cron";
import { initCommands } from "./handlers/commands";
import { initActions } from "./handlers/actions";
import { initTextHandlers } from "./handlers/text";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Ошибка: Переменная env BOT_TOKEN не задана!");
  process.exit(1);
}

const bot = new Telegraf<Context>(token);

interface UserSession {
  selectedDate?: string;
  selectedTime?: string;
  selectedChats?: number[];
  selectedReminders?: string[];
  selectedRecurrence?: string;
  step?:
    | "awaiting_chats"
    | "awaiting_reminders"
    | "awaiting_recurrence"
    | "awaiting_title";
}

// Единое хранилище сессий, передаваемое во все модули по ссылке
const userSessions: Record<number, UserSession> = {};

// --- Системный перехватчик структуры чатов (Группы/Каналы) ---
bot.on("my_chat_member", async (ctx) => {
  const chat = ctx.myChatMember.chat;
  const status = ctx.myChatMember.new_chat_member.status;

  if (status === "member" || status === "administrator") {
    const title = "title" in chat ? chat.title : "Канал/Группа";
    try {
      await db.execute(
        "INSERT INTO chats (chat_id, chat_title) VALUES (?, ?) ON DUPLICATE KEY UPDATE chat_title = ?",
        [chat.id, title, title],
      );
    } catch (err) {
      console.error(err);
    }
  } else if (status === "left" || status === "kicked") {
    try {
      await db.execute("DELETE FROM chats WHERE chat_id = ?", [chat.id]);
    } catch (err) {
      console.error(err);
    }
  }
});

// --- Инициализация изолированных слоев приложения ---
initCommands(bot, userSessions);
initActions(bot, userSessions);
initTextHandlers(bot, userSessions);

// Инициализация фонового МСК-крона
initCron(bot);

// Запуск
bot
  .launch()
  .then(() => console.log("🚀 Модульная экосистема бота успешно запущена!"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
