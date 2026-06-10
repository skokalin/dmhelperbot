import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

export const db = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "bot_user",
  password: process.env.DB_PASSWORD || "bot_password",
  database: process.env.DB_NAME || "calendar_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, "../migrations");

  try {
    // 1. Создаем служебную таблицу для истории миграций, если её нет
    await db.execute(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (!fs.existsSync(migrationsDir)) {
      console.warn(`[Migrations] Папка не найдена: ${migrationsDir}`);
      return;
    }

    // 2. Читаем и сортируем файлы по имени (001, 002...)
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    // 3. Получаем список уже примененных миграций из БД
    const [appliedRows]: [any[], any] = await db.execute(
      "SELECT filename FROM migration_history",
    );
    const appliedFiles = appliedRows.map((row) => row.filename);

    // 4. Проходим по каждому файлу
    for (const file of files) {
      if (appliedFiles.includes(file)) {
        continue; // Пропускаем, если уже выполнялся
      }

      console.log(`[Migrations] Применение новой миграции: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, "utf8");

      // Разбиваем файл на отдельные запросы
      const queries = sqlContent
        .split(";")
        .map((q) => q.trim())
        .filter((q) => q.length > 0);

      for (const query of queries) {
        await db.execute(query);
      }

      // Записываем в историю, что файл успешно выполнен
      await db.execute("INSERT INTO migration_history (filename) VALUES (?)", [
        file,
      ]);
      console.log(`[Migrations] ✅ Успешно применено: ${file}`);
    }

    console.log(
      "[Migrations] Проверка и синхронизация файлов миграций завершена.",
    );
  } catch (error) {
    console.error("[Migrations] Критическая ошибка движка миграций:", error);
  }
}

runMigrations();
