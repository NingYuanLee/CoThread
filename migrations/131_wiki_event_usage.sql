-- 问老翁每一轮的量与耗时记到该轮的助手事件上，轨迹「概述」才能显示 Token、首 token 延迟、生成耗时与吞吐量。
ALTER TABLE wiki_session_events
  ADD COLUMN usage_json JSON NULL AFTER output;
