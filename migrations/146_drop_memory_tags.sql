-- 标签功能下线：memory_tags 列不再使用，删除该列；受控二级类型 memory_subtype 保留。
ALTER TABLE wiki_pages DROP COLUMN memory_tags;
