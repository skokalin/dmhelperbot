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
        `SELECT r.id as reminder_id, r.reminder_type, e.id as event_id, e.user_id, e.event_title, e.target_chats, e.recurrence
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

        // Если это финальное напоминание (в момент начала события, offset_ms === 0) и оно повторяющееся
        if (Number(rem.offset_ms) === 0 && rem.recurrence !== "none") {
          // Достаем текущую дату старта из базы
          const [eventData]: any = await db.execute(
            "SELECT event_date FROM events WHERE id = ?",
            [rem.event_id],
          );

          if (eventData.length > 0) {
            const currentEventDate = new Date(eventData[0].event_date);

            // Рассчитываем дату старта на следующий цикл
            if (rem.recurrence === "daily")
              currentEventDate.setDate(currentEventDate.getDate() + 1);
            if (rem.recurrence === "weekly")
              currentEventDate.setDate(currentEventDate.getDate() + 7);
            if (rem.recurrence === "monthly")
              currentEventDate.setMonth(currentEventDate.getMonth() + 1);
            if (rem.recurrence === "yearly")
              currentEventDate.setFullYear(currentEventDate.getFullYear() + 1);

            // Форматируем в SQL формат YYYY-MM-DD HH:mm:ss
            const nextEventDateStr = currentEventDate
              .toISOString()
              .slice(0, 19)
              .replace("T", " ");

            // Обновляем главную дату события на следующий цикл вперед
            await db.execute("UPDATE events SET event_date = ? WHERE id = ?", [
              nextEventDateStr,
              rem.event_id,
            ]);

            // Вытягиваем ВСЕ напоминания этого события, чтобы пересчитать их даты от новой точки старта
            const [allReminders]: [any[], any] = await db.execute(
              "SELECT id, offset_ms FROM event_reminders WHERE event_id = ?",
              [rem.event_id],
            );

            for (const r of allReminders) {
              // Новое время напоминания = Новый старт события МИНУС сдвиг этого напоминания
              const nextReminderTime = new Date(
                currentEventDate.getTime() - Number(r.offset_ms),
              );
              const nextReminderDateStr = nextReminderTime
                .toISOString()
                .slice(0, 19)
                .replace("T", " ");

              // Сбрасываем is_sent в 0 и прописываем новую дату на будущий цикл
              await db.execute(
                "UPDATE event_reminders SET reminder_date = ?, is_sent = 0 WHERE id = ?",
                [nextReminderDateStr, r.id],
              );
            }
            console.log(
              `[Cron] Событие ID ${rem.event_id} успешно перенесено на цикл вперед: ${nextEventDateStr}`,
            );
          }
        } else {
          // Логика для обычных предварительных напоминаний или разовых событий
          // Проверяем, остались ли еще у этого события неотправленные напоминания
          const [remaining]: [any[], any] = await db.execute(
            "SELECT id FROM event_reminders WHERE event_id = ? AND is_sent = 0",
            [rem.event_id],
          );

          // Если напоминаний больше нет и событие НЕ повторяющееся — полностью удаляем его из базы
          if (remaining.length === 0 && rem.recurrence === "none") {
            await db.execute("DELETE FROM events WHERE id = ?", [rem.event_id]);
            console.log(
              `[Cron] Разовое событие ID ${rem.event_id} завершено и удалено.`,
            );
          }
        }
      }
    } catch (dbError) {
      console.error("Ошибка Cron напоминаний:", dbError);
    }
  });
}
