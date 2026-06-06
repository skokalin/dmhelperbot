# 📅 Telegram Calendar Bot (TypeScript + MySQL + Docker)

Связка Telegram-бота и базы данных MySQL для планирования и сохранения событий. Бот написан на **TypeScript** с использованием библиотеки **Telegraf** и полностью обернут в **Docker** с поддержкой **Docker Compose** для быстрого развертывания на любом VPS или локально в WSL.

## 🚀 Особенности
*   **Полная автономность**: Календарь и таймпикер (выбор часов и минут) написаны на чистом TypeScript. Никаких капризных сторонних npm-пакетов, которые ломают сборку.
*   **Пошаговый UI**: Интуитивный процесс создания события: Выбор даты ➡️ Выбор часа ➡️ Выбор минут ➡️ Ввод названия.
*   **Надежное хранение**: Все события записываются в базу данных MySQL в формате `DATETIME`. Данные не стираются при перезапуске контейнеров.
*   **Готов к VPS**: Деплой одной командой благодаря настроенному Docker Compose.

---

## 📁 Структура проекта
```text
ts_mysql_bot/
├── bot.ts               # Исходный код бота (логика, UI, БД)
├── package.json         # Зависимости Node.js
├── tsconfig.json        # Конфигурация компилятора TypeScript
├── Dockerfile           # Инструкция сборки контейнера приложения
├── init.sql             # Скрипт автоматического создания таблиц в MySQL
├── docker-compose.yml   # Оркестратор контейнеров (Бот + MySQL)
└── .env                 # Переменные окружения (токен бота) - не для Git!
```

---

## 💻 Локальный запуск и тестирование (WSL / Linux)

### 1. Подготовка конфигурации
В корневой папке проекта создайте файл `.env` и добавьте туда ваш токен от `@BotFather`:
```env
BOT_TOKEN=1234567890:ABCdefGhIJKlmNoPQRsTUVwXyZ
```

### 2. Запуск контейнеров
Запустите сборку и старт проекта в режиме реального времени (чтобы видеть логи):
```bash
docker compose up --build
```
*(Если вы используете старую версию Docker Compose, пишите команду через дефис: `docker-compose up --build`)*

### 3. Остановка
Для остановки контейнеров нажмите `Ctrl + C` в терминале. 

Если вам нужно полностью сбросить базу данных и удалить сохраненные события для нового теста, выполните:
```bash
docker compose down -v
```

---

## 🌐 Деплой на VPS (Ubuntu 22.04 / 24.04 LTS)

### Шаг 1: Установка Docker на чистый сервер
Подключитесь к вашему VPS по SSH и выполните скрипт для установки официального Docker и плагина Compose:

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release

# Добавление GPG-ключа Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://docker.com | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Подключение репозитория
echo \
  "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://github.com \
  \$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка пакетов
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# (Опционально) Разрешение запуска без sudo
sudo usermod -aG docker \$USER
```
*После выполнения команд перезапустите SSH-сессию.*

### Шаг 2: Развертывание проекта
1. Скопируйте файлы проекта на VPS (через Git или SFTP).
2. Создайте файл `.env` с вашим реальным `BOT_TOKEN` прямо на сервере.
3. Запустите всю систему в фоновом режиме (демоне):
```bash
docker compose up -d --build
```

Контейнер базы данных MySQL автоматически применит схему данных из `init.sql`, а контейнер бота настроит автоперезапуск (`unless-stopped`) на случай сбоев сети или перезагрузки сервера.

---

## 🗄️ Схема базы данных (MySQL)
Таблица `events` инициализируется скриптом `init.sql`:
*   `id`: Первичный ключ с автоинкрементом.
*   `user_id`: Telegram ID пользователя (`BIGINT`), чтобы поддерживать длинные идентификаторы.
*   `event_title`: Название события (`VARCHAR(255)`).
*   `event_date`: Дата и время события (`DATETIME`), объединенные из UI календаря.
*   `created_at`: Таймстемп создания записи.
