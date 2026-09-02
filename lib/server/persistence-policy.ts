export const PROJECT_REQUEST_BYTE_LIMIT = 320_000;
export const PROJECT_SNAPSHOT_CHARACTER_LIMIT = 256_000;
export const COMMIT_SNAPSHOT_LIMIT = 40;
export const STAGED_CHANGE_SET_LIMIT = 8;

export const COMPACT_COMMIT_SNAPSHOTS_SQL = `UPDATE studio_commits
  SET before_payload = '{}', after_payload = '{}'
  WHERE workspace_id = ?
  AND EXISTS (SELECT 1 FROM studio_commits WHERE id = ? AND workspace_id = ?)
  AND id = (
    SELECT id FROM studio_commits WHERE workspace_id = ? ORDER BY revision DESC LIMIT 1 OFFSET ${COMMIT_SNAPSHOT_LIMIT}
  )
  AND (before_payload <> '{}' OR after_payload <> '{}')`;

export const PRUNE_STAGED_CHANGE_SETS_SQL = `DELETE FROM studio_change_sets
  WHERE workspace_id = ?
  AND EXISTS (SELECT 1 FROM studio_change_sets WHERE id = ? AND workspace_id = ?)
  AND id NOT IN (
    SELECT id FROM studio_change_sets
    WHERE workspace_id = ?
    ORDER BY created_at DESC, rowid DESC
    LIMIT ${STAGED_CHANGE_SET_LIMIT}
  )`;
