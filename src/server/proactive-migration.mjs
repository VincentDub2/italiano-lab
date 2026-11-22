export function migrateProactive(db) {
 db.exec(`
  CREATE INDEX learning_attempts_by_version ON learning_attempts(version_id,submitted_at);
  CREATE INDEX sentence_attempts_by_scope ON sentence_attempts(context,scope_id,version_id);
  CREATE TABLE learning_observations (
   attempt_id TEXT NOT NULL REFERENCES learning_attempts(id),
   notion_id TEXT NOT NULL REFERENCES notions(id),
   kind TEXT NOT NULL CHECK(kind IN ('error','strength','style','typo')),
   explanation TEXT NOT NULL,
   PRIMARY KEY(attempt_id,notion_id,kind,explanation)
  );
  CREATE INDEX learning_observations_by_notion ON learning_observations(notion_id,kind,attempt_id);
  CREATE TABLE proactive_lessons (
   id TEXT PRIMARY KEY,
   notion_id TEXT NOT NULL REFERENCES notions(id),
   session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
   reason TEXT NOT NULL,
   status TEXT NOT NULL CHECK(status IN ('draft','advised','in_progress','j0_completed','dismissed')),
   created_at TEXT NOT NULL,
   advised_at TEXT,
   started_at TEXT,
   j0_date TEXT,
   dismissed_at TEXT,
   dismissed_reason TEXT CHECK(dismissed_reason IN ('student','evidence'))
  );
  CREATE UNIQUE INDEX proactive_lesson_slot ON proactive_lessons((1)) WHERE status IN ('advised','in_progress');
  CREATE INDEX proactive_lessons_by_notion ON proactive_lessons(notion_id,status);
  CREATE TABLE proactive_lesson_evidence (
   lesson_id TEXT NOT NULL REFERENCES proactive_lessons(id),
   attempt_id TEXT NOT NULL REFERENCES learning_attempts(id),
   PRIMARY KEY(lesson_id,attempt_id)
  );
  CREATE TABLE proactive_milestones (
   id TEXT PRIMARY KEY,
   lesson_id TEXT NOT NULL REFERENCES proactive_lessons(id),
   step INTEGER NOT NULL CHECK(step IN (1,3,7,14,30)),
   due_date TEXT NOT NULL,
   completed_at TEXT,
   completed_session_id TEXT REFERENCES sessions(id),
   result TEXT CHECK(result IN ('correct','assisted','needs_work')),
   UNIQUE(lesson_id,step)
  );
  CREATE TABLE proactive_revision_links (
   milestone_id TEXT NOT NULL REFERENCES proactive_milestones(id),
   occurrence_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
   PRIMARY KEY(milestone_id,occurrence_id)
  );
  CREATE INDEX proactive_revision_by_occurrence ON proactive_revision_links(occurrence_id);
  CREATE TABLE proactive_milestone_attempts (
   milestone_id TEXT NOT NULL REFERENCES proactive_milestones(id),
   attempt_id TEXT NOT NULL REFERENCES learning_attempts(id),
   PRIMARY KEY(milestone_id,attempt_id)
  );
  INSERT INTO schema_migrations(version) VALUES (11);
 `);
}
