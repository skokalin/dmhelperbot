import cron from "node-cron";
import { Telegraf, Context } from "telegraf";
import { db } from "../config/db";

export function initCron(bot: Telegraf<Context>) {
  cron.schedule("* * * * *", async () => {
    const now = new Date();

    // Получаем текущее время по МСК (нативный фикс, как в прошлом шаге)
    const mskFormatter = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = mskFormatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;

    const currentCheckTime = `${year}-${month}-${day} ${hour}:${minute}:00`;

    try {
      // Ищем напоминания, время которых пришло
      const [reminders]: [any[], any] = await db.execute(
        `SELECT r.id as reminder_id, r.reminder_type, e.id as event_id, e.user_id, e.event_title, e.target_chats
         FROM event_reminders r
         JOIN events e ON r.event_id = e.id
         WHERE r.reminder_date = ? AND r.is_sent = 0`,
        [currentCheckTime],
      );

      for (const rem of reminders) {
        const text = `🔔 **НАПОМИНАНИЕ (${rem.reminder_type})**\n📌 Событие: **${rem.event_title}**`;

        // 1. Отправка создателю
        try {
          await bot.telegram.sendMessage(rem.user_id, text, {
            parse_mode: "Markdown",
          });
        } catch (e) {
          console.error(e);
        }

        // 2. Отправка в выбранные чаты
        if (rem.target_chats) {
          const chatIds = rem.target_chats.split(",").map(Number);
          for (const chatId of chatIds) {
            try {
              await bot.telegram.sendMessage(chatId, text, {
                parse_mode: "Markdown",
              });
            } catch (err) {
              console.error(err);
            }
          }
        }

        // Помечаем напоминание как отправленное
        await db.execute(
          "UPDATE event_reminders SET is_sent = 1 WHERE id = ?",
          [rem.reminder_id],
        );

        // Проверяем, остались ли у этого события еще неотправленные напоминания
        const [remaining]: [any[], any] = await db.execute(
          "SELECT id FROM event_reminders WHERE event_id = ? AND is_sent = 0",
          [rem.event_id],
        );

        // Если все напоминания для события закончились, удаляем само событие (каскадно удалятся и напоминания)
        if (remaining.length === 0) {
          await db.execute("DELETE FROM events WHERE id = ?", [rem.event_id]);
        }
      }
    } catch (dbError) {
      console.error("Ошибка Cron напоминаний:", dbError);
    }
  });
}
