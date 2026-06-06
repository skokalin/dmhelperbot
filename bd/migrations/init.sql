CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event_title VARCHAR(255) NOT NULL,
    event_date DATETIME NOT NULL,
    reminded_week TINYINT(1) DEFAULT 0,
    reminded_day TINYINT(1) DEFAULT 0,
    reminded_hour TINYINT(1) DEFAULT 0,
    target_chats TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Таблица для учета чатов, куда добавлен бот
CREATE TABLE IF NOT EXISTS chats (
    chat_id BIGINT PRIMARY KEY,
    chat_title VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
