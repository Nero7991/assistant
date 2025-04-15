-- Update existing 'daily' task types to 'regular'
UPDATE tasks SET task_type = 'regular' WHERE task_type = 'daily';