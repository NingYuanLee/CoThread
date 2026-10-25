-- 老翁每条回复记下本轮用量和用时，和群聊里小祥的回复一样。
ALTER TABLE wiki_answers
  ADD COLUMN usage_json JSON NULL AFTER trace;
