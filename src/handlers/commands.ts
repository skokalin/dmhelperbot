import { Telegraf, Context, Markup } from "telegraf";
import { db } from "../config/db";
import { createCalendarKeyboard } from "../keyboards/inline";

export function initCommands(
  bot: Telegraf<Context>,
  userSessions: Record<number, any>,
) {
  bot.start((ctx) => {
    ctx.reply(
      "Привет! Я твой МСК бот-календарь с мультирассылкой.\n\n" +
        "📅 /add — запланировать событие (только в ЛС)\n" +
        "📋 /list — посмотреть список ваших событий",
    );
  });

  bot.command("add", (ctx) => {
    if (ctx.chat.type !== "private") {
      return ctx.reply(
        "⚠️ Настраивать новые события можно только в личном чате с ботом.",
      );
    }
    const userId = ctx.from.id;
    userSessions[userId] = { selectedChats: [], selectedReminders: [] };
    ctx.reply("Шаг 1/5: Выбери дату:", createCalendarKeyboard());
  });

  bot.command("list", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const [rows]: [any[], any] = await db.execute(
        "SELECT id, event_title, event_date FROM events WHERE user_id = ? ORDER BY event_date ASC",
        [userId],
      );
      if (rows.length === 0)
        return ctx.reply("📭 У вас пока нет запланированных событий.");

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
      ctx.reply("❌ Ошибка получения списка.");
    }
  });
}
