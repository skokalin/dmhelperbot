CREATE TABLE IF NOT EXISTS chats (
    chat_id BIGINT PRIMARY KEY,
    chat_title VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event_title VARCHAR(255) NOT NULL,
    event_date DATETIME NOT NULL, -- Точное время начала события по МСК
    target_chats TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Новая таблица для хранения отдельных напоминаний
CREATE TABLE IF NOT EXISTS event_reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    reminder_date DATETIME NOT NULL, -- Вычисленное время МСК, когда нужно отправить это конкретное напоминание
    reminder_type VARCHAR(50) NOT NULL, -- Строка для текста, например: "за 1 час", "за 1 день", "в момент начала"
    is_sent TINYINT(1) DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
