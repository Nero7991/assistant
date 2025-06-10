-- Add unique constraint to prevent duplicate pending morning messages
-- This ensures only one pending morning message per user at any time
CREATE UNIQUE INDEX idx_unique_pending_morning_message 
ON message_schedules (user_id, type) 
WHERE status IN ('pending', 'scheduled') AND type = 'morning_message';

-- Add comprehensive unique constraint to prevent duplicate messages of same type and scheduled time
-- This prevents race conditions where multiple instances create the same reminder
CREATE UNIQUE INDEX idx_unique_pending_messages_per_time 
ON message_schedules (user_id, type, scheduled_for) 
WHERE status IN ('pending', 'scheduled');

-- Add unique constraint for task-specific reminders to prevent duplicate task reminders
-- This ensures each task can only have one set of reminders per day
CREATE UNIQUE INDEX idx_unique_task_reminders 
ON message_schedules (user_id, type, ((metadata->>'taskId')::integer), date_trunc('day', scheduled_for))
WHERE status IN ('pending', 'scheduled') 
  AND type IN ('pre_reminder', 'reminder', 'post_reminder_follow_up')
  AND metadata ? 'taskId';

-- Add index for efficient querying of pending messages
CREATE INDEX IF NOT EXISTS idx_message_schedules_status_scheduled_for 
ON message_schedules (status, scheduled_for) 
WHERE status = 'pending';

-- Add index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_message_schedules_user_status 
ON message_schedules (user_id, status, type);

-- Add index for task-specific queries
CREATE INDEX IF NOT EXISTS idx_message_schedules_task_metadata 
ON message_schedules USING gin (metadata) 
WHERE metadata ? 'taskId';

-- Add comments explaining the constraints
COMMENT ON INDEX idx_unique_pending_morning_message IS 
'Prevents duplicate pending morning messages for the same user. Only one morning message can be pending or scheduled at a time.';

COMMENT ON INDEX idx_unique_pending_messages_per_time IS 
'Prevents duplicate messages of the same type scheduled for the exact same time per user.';

COMMENT ON INDEX idx_unique_task_reminders IS 
'Prevents duplicate task reminders. Each task can only have one pre_reminder, reminder, and post_reminder_follow_up per day per user.';