UPDATE messages m
JOIN connector_tasks t ON t.response_message_id=m.id
SET m.author_id=t.assigned_to
WHERE m.source='local_ai' AND m.author_id<>t.assigned_to;
