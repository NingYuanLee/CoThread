/** 文件索引页面的可见性 SQL。`alias` 是调用方查询里的可信标识符。 */
function assertAlias(alias: string): void {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
}

/**
 * A derived file page is usable only while the exact version it describes is
 * still the current, non-recycled version of a live artifact. Registry rows
 * survive physical deletion, so an orphaned page is not accidentally exposed.
 * `alias` is a trusted SQL identifier supplied by the calling query.
 */
export function visibleFileIndexSql(alias: string): string {
  assertAlias(alias);
  return `(NOT EXISTS (
    SELECT 1 FROM file_index_entries fi
    LEFT JOIN artifacts fa ON fa.id=fi.artifact_id AND fa.project_id=fi.project_id
    LEFT JOIN versions fv ON fv.id=fi.indexed_version_id AND fv.artifact_id=fa.id
    LEFT JOIN version_recycle fr ON fr.version_id=fv.id
    WHERE fi.page_id=${alias}.id AND (
      fa.id IS NULL OR fa.deleted_at IS NOT NULL OR fa.purged_at IS NOT NULL
      OR fv.id IS NULL OR fr.version_id IS NOT NULL
      OR (fi.summary_sha256 IS NOT NULL AND
        (NOT (fi.summary_sha256 <=> fv.sha256) OR NOT (fi.summary_mime <=> fv.mime)))
      OR EXISTS (
        SELECT 1 FROM versions newer
        LEFT JOIN version_recycle newer_recycle ON newer_recycle.version_id=newer.id
        WHERE newer.artifact_id=fa.id AND newer.version>fv.version
          AND newer_recycle.version_id IS NULL
      )
    )
  ) AND NOT (
    ${alias}.subject_type='document'
    AND NOT EXISTS (SELECT 1 FROM file_index_entries legacy_index WHERE legacy_index.page_id=${alias}.id)
    AND EXISTS (
      SELECT 1 FROM wiki_page_sources legacy_source
      LEFT JOIN versions legacy_version ON legacy_source.source_kind='document_version' AND legacy_version.id=legacy_source.source_id
      LEFT JOIN artifacts legacy_artifact ON legacy_artifact.id=legacy_version.artifact_id
      LEFT JOIN version_recycle legacy_recycle ON legacy_recycle.version_id=legacy_version.id
      WHERE legacy_source.page_id=${alias}.id AND legacy_source.source_kind='document_version'
        AND (legacy_version.id IS NULL OR legacy_artifact.id IS NULL OR legacy_artifact.deleted_at IS NOT NULL
          OR legacy_artifact.purged_at IS NOT NULL OR legacy_recycle.version_id IS NOT NULL)
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM file_index_groups fg WHERE fg.page_id=${alias}.id AND (
      fg.dismissed_at IS NOT NULL OR
      (SELECT COUNT(*) FROM file_index_group_members fm WHERE fm.group_id=fg.id)<2
      OR (fg.manually_managed=0 AND fg.evidence_kind='reference' AND NOT EXISTS (
        SELECT 1 FROM file_index_entries evidence_index JOIN file_index_group_members evidence_member
          ON evidence_member.group_id=fg.id AND evidence_member.artifact_id=evidence_index.artifact_id
        WHERE evidence_index.project_id=fg.project_id AND evidence_index.artifact_id=fg.evidence_artifact_id
          AND evidence_index.indexed_version_id=fg.evidence_version_id
      ))
      OR (fg.manually_managed=0 AND fg.evidence_kind='reference' AND NOT EXISTS (
        SELECT 1 FROM file_index_entries target_index JOIN file_index_group_members target_member
          ON target_member.group_id=fg.id AND target_member.artifact_id=target_index.artifact_id
        WHERE target_index.project_id=fg.project_id AND target_index.artifact_id<>fg.evidence_artifact_id
          AND target_index.indexed_version_id=fg.evidence_target_version_id
      ))
      OR (fg.manually_managed=0 AND fg.evidence_kind='reference' AND (
        -- 同名候选核对：按目标版本的文件名直接查版本表（迁移 224 的函数索引
        -- versions((LOWER(filename))) 承载），不再逐组遍历项目内每个候选文件。
        -- STRAIGHT_JOIN 固定驱动顺序，否则优化器会退回按 artifact 扫全表。
        SELECT COUNT(*) FROM versions candidate_version
        STRAIGHT_JOIN file_index_entries candidate_index ON candidate_index.project_id=fg.project_id
          AND candidate_index.artifact_id=candidate_version.artifact_id
          AND candidate_index.indexed_version_id=candidate_version.id
        STRAIGHT_JOIN wiki_pages candidate_page ON candidate_page.id=candidate_index.page_id AND candidate_page.status='current'
        STRAIGHT_JOIN artifacts candidate_artifact ON candidate_artifact.id=candidate_index.artifact_id
          AND candidate_artifact.project_id=candidate_index.project_id
          AND candidate_version.artifact_id=candidate_artifact.id
        LEFT JOIN version_recycle candidate_recycle ON candidate_recycle.version_id=candidate_version.id
        WHERE LOWER(candidate_version.filename)=(SELECT LOWER(target_version.filename) FROM versions target_version WHERE target_version.id=fg.evidence_target_version_id)
          AND candidate_index.artifact_id<>fg.evidence_artifact_id
          AND candidate_artifact.deleted_at IS NULL AND candidate_artifact.purged_at IS NULL
          AND candidate_recycle.version_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM versions newest LEFT JOIN version_recycle newest_recycle ON newest_recycle.version_id=newest.id
            WHERE newest.artifact_id=candidate_artifact.id AND newest.version>candidate_version.version AND newest_recycle.version_id IS NULL)
      )<>1)
      OR (fg.manually_managed=0 AND fg.evidence_kind='copy' AND NOT EXISTS (
        SELECT 1 FROM artifacts copied JOIN file_index_group_members copied_member
          ON copied_member.group_id=fg.id AND copied_member.artifact_id=copied.id
        JOIN file_index_group_members source_member ON source_member.group_id=fg.id
          AND source_member.artifact_id=copied.source_artifact_id
        WHERE copied.project_id=fg.project_id AND copied.id=fg.evidence_artifact_id
      ))
      OR EXISTS (
        SELECT 1 FROM file_index_group_members fm
        LEFT JOIN file_index_entries fi ON fi.project_id=fg.project_id AND fi.artifact_id=fm.artifact_id
        LEFT JOIN artifacts fa ON fa.id=fm.artifact_id AND fa.project_id=fg.project_id
        LEFT JOIN versions fv ON fv.id=fi.indexed_version_id AND fv.artifact_id=fa.id
        LEFT JOIN version_recycle fr ON fr.version_id=fv.id
        WHERE fm.group_id=fg.id AND (fi.page_id IS NULL OR fa.id IS NULL OR fa.deleted_at IS NOT NULL
          OR fa.purged_at IS NOT NULL OR fv.id IS NULL OR fr.version_id IS NOT NULL
          OR (fi.summary_sha256 IS NOT NULL AND
            (NOT (fi.summary_sha256 <=> fv.sha256) OR NOT (fi.summary_mime <=> fv.mime)))
          OR EXISTS (SELECT 1 FROM versions newer LEFT JOIN version_recycle nr ON nr.version_id=newer.id
            WHERE newer.artifact_id=fa.id AND newer.version>fv.version AND nr.version_id IS NULL))
      )
    )
  ))`;
}

export function visibleFileSourceSql(alias: string): string {
  assertAlias(alias);
  return `(${alias}.source_kind<>'document_version' OR EXISTS (
    SELECT 1 FROM versions source_version JOIN artifacts source_artifact ON source_artifact.id=source_version.artifact_id
    LEFT JOIN version_recycle source_recycle ON source_recycle.version_id=source_version.id
    WHERE source_version.id=${alias}.source_id AND source_artifact.deleted_at IS NULL
      AND source_artifact.purged_at IS NULL AND source_recycle.version_id IS NULL
  ))`;
}

/** Old revisions are allowed; deleted/recycled/purged files remain inaccessible. */
export function historicalFileIndexSql(alias: string): string {
  assertAlias(alias);
  return `NOT EXISTS (SELECT 1 FROM wiki_page_sources hs
    LEFT JOIN versions hv ON hs.source_kind='document_version' AND hv.id=hs.source_id
    LEFT JOIN artifacts ha ON ha.id=hv.artifact_id AND ha.project_id=${alias}.project_id
    LEFT JOIN version_recycle hr ON hr.version_id=hv.id
    WHERE hs.page_id=${alias}.id AND hs.source_kind='document_version'
      AND (hv.id IS NULL OR ha.id IS NULL OR ha.deleted_at IS NOT NULL OR ha.purged_at IS NOT NULL OR hr.version_id IS NOT NULL))
    AND NOT EXISTS (SELECT 1 FROM file_index_group_members hm JOIN file_index_groups hg ON hg.id=hm.group_id
    LEFT JOIN artifacts ha ON ha.id=hm.artifact_id AND ha.project_id=hg.project_id
    WHERE hg.page_id=${alias}.id AND (ha.id IS NULL OR ha.deleted_at IS NOT NULL OR ha.purged_at IS NOT NULL))`;
}

/** Summary cache is not authoritative when an immutable-looking version ID
 * has been replaced in place. Historical versions without a registry entry
 * retain their prior behavior. Aliases are trusted identifiers. */
export function validDocumentSummarySql(versionAlias: string): string {
  assertAlias(versionAlias);
  return `NOT EXISTS (SELECT 1 FROM file_index_entries summary_index
    WHERE summary_index.indexed_version_id=${versionAlias}.id AND summary_index.summary_sha256 IS NOT NULL
      AND (NOT (summary_index.summary_sha256 <=> ${versionAlias}.sha256)
        OR NOT (summary_index.summary_mime <=> ${versionAlias}.mime)))`;
}
