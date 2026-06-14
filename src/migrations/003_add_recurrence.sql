
ALTER TABLE events
ADD COLUMN recurrence VARCHAR(50) DEFAULT 'none' AFTER target_chats;


ALTER TABLE event_reminders
ADD COLUMN offset_ms BIGINT NOT NULL DEFAULT 0 AFTER reminder_type;
