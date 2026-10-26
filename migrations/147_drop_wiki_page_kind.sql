-- 知识页类型 kind（guide/decision/retro/glossary/status）已由 subject_type 与 memory_subtype 取代。
-- 单语句以便迁移器幂等：列不在时跳过；列被删后 wiki_pages_project 自动收缩为 (project_id, status)。
ALTER TABLE wiki_pages DROP COLUMN kind;
