import mysql from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "bot_user",
  password: process.env.DB_PASSWORD || "bot_password",
  database: process.env.DB_NAME || "calendar_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // НАДЁЖНЫЙ ФИКС ТАЙМАУТОВ:
  enableKeepAlive: true, // Заставляет драйвер пинговать базу и не давать закрывать коннекты
  keepAliveInitialDelay: 10000, // Каждые 10 секунд
});
