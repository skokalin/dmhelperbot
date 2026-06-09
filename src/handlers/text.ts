import { Telegraf, Context } from "telegraf";
import { db } from "../config/db";
import { REMINDER_OPTIONS } from "../keyboards/inline";

export function initTextHandlers(
  bot: Telegraf<Context>,
  userSessions: Record<number, any>,
) {
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
      const fullDateTimeStr = `${session.selectedDate} ${session.selectedTime}:00`;
      const targetChatsStr = (session.selectedChats || []).join(",");

      try {
        const [result]: any = await db.execute(
          "INSERT INTO events (user_id, event_title, event_date, target_chats) VALUES (?, ?, ?, ?)",
          [userId, eventTitle, fullDateTimeStr, targetChatsStr],
        );
        const eventId = result.insertId;

        const [datePart, timePart] = fullDateTimeStr.split(" ");
        const [yearNum, monthNum, dayNum] = datePart.split("-").map(Number);
        const [hourNum, minNum] = timePart.split(":").map(Number);

        const selectedReminders = session.selectedReminders || [];
        if (selectedReminders.length === 0) selectedReminders.push("exact");

        for (const rId of selectedReminders) {
          const option = REMINDER_OPTIONS.find((o) => o.id === rId);
          if (!option) continue;

          const reminderTime = new Date(
            yearNum,
            monthNum - 1,
            dayNum,
            hourNum,
            minNum,
            0,
          );
          const calculatedTime = new Date(reminderTime.getTime() - option.ms);

          const rYear = calculatedTime.getFullYear();
          const rMonth = String(calculatedTime.getMonth() + 1).padStart(2, "0");
          const rDay = String(calculatedTime.getDate()).padStart(2, "0");
          const rHour = String(calculatedTime.getHours()).padStart(2, "0");
          const rMin = String(calculatedTime.getMinutes()).padStart(2, "0");

          const dbReminderDate = `${rYear}-${rMonth}-${rDay} ${rHour}:${rMin}:00`;

          await db.execute(
            "INSERT INTO event_reminders (event_id, reminder_date, reminder_type) VALUES (?, ?, ?)",
            [eventId, dbReminderDate, option.label],
          );
        }

        ctx.reply(
          `✅ Событие "${eventTitle}" успешно создано!\nУведомления придут вовремя согласно выбранным интервалам.`,
        );
        delete userSessions[userId];
      } catch (error) {
        console.error("Критическая ошибка MySQL:", error);
        ctx.reply("❌ Ошибка записи в базу данных.");
      }
    } else {
      return next();
    }
  });
}
