-- 文件索引可见性：引用型关联组要核对「项目里同名文件恰好一个」，原先逐组把项目内
-- 每个候选文件的版本都取出来比文件名，复杂度是 组数 × 项目文件数。改为按目标版本的文件名
-- 直接查版本表（LOWER() 语义不变，用函数索引承载），把每组的候选扫描压到同名版本数。
-- 索引表达式与查询里的 LOWER(filename) 完全一致，比较口径不变。
-- 函数索引内部是「加虚拟列 + 建索引」，MySQL 不支持 LOCK=NONE（要 LOCK=SHARED，写入会被
-- 短暂挡住）；显式声明 ALGORITHM=INPLACE 以避免整表复制——versions 存文件内容，正式库上
-- 复制整表代价与风险都高。
ALTER TABLE versions ADD INDEX versions_filename_lower ((LOWER(filename))), ALGORITHM=INPLACE;
