-- 成员记忆改名发言记忆：记的是「某成员说过什么」，不是对一个人的评价。
-- 137 已经应用的环境用本迁移改名；未应用的环境按 137 → 138 顺序执行同样收敛到 utterance。
ALTER TABLE wiki_pages
  MODIFY subject_type ENUM('member','utterance','document','task','discussion','project') NULL;

UPDATE wiki_pages SET subject_type='utterance' WHERE subject_type='member';

ALTER TABLE wiki_pages
  MODIFY subject_type ENUM('utterance','document','task','discussion','project') NULL;

-- 发言记忆按项目成员维度存：about_user_id 指向「这条记忆说的是谁」。
-- 同一个人在同一项目只有一条发言记忆，滚动更新。ON DELETE SET NULL 保证账号删除后记忆仍可追溯。
ALTER TABLE wiki_pages
  ADD COLUMN about_user_id CHAR(36) NULL AFTER subject_type,
  ADD KEY wiki_pages_about (project_id, about_user_id, subject_type, status),
  ADD CONSTRAINT fk_wiki_pages_about FOREIGN KEY (about_user_id) REFERENCES users(id) ON DELETE SET NULL;
