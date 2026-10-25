-- 引用要能点开：记下类型，以及网页地址、迭代、文档或知识页的目标。
ALTER TABLE wiki_answer_citations
  ADD COLUMN kind VARCHAR(32) NULL AFTER page_id,
  ADD COLUMN target VARCHAR(2048) NULL AFTER kind;
