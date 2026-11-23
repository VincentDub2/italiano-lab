export function migrateAssessments(db) {
 db.exec(`
  CREATE TABLE assessments (
   id TEXT PRIMARY KEY,
   status TEXT NOT NULL CHECK(status IN ('draft','offered','in_progress','submitted','reviewed','dismissed','abandoned')),
   revision INTEGER NOT NULL DEFAULT 0,
   title TEXT NOT NULL,
   objective TEXT NOT NULL,
   reason TEXT NOT NULL,
   estimated_minutes INTEGER NOT NULL,
   criteria_json TEXT NOT NULL,
   created_at TEXT NOT NULL,
   offered_at TEXT,
   started_at TEXT,
   submitted_at TEXT,
   closed_at TEXT
  );
  CREATE UNIQUE INDEX single_active_assessment ON assessments((1)) WHERE status IN ('offered','in_progress');
  CREATE TABLE assessment_notions (
   assessment_id TEXT NOT NULL REFERENCES assessments(id),
   notion_id TEXT NOT NULL REFERENCES notions(id),
   PRIMARY KEY(assessment_id,notion_id)
  );
  CREATE TABLE assessment_tasks (
   id TEXT PRIMARY KEY,
   assessment_id TEXT NOT NULL REFERENCES assessments(id),
   position INTEGER NOT NULL,
   definition_json TEXT NOT NULL,
   UNIQUE(assessment_id,position)
  );
  CREATE TABLE assessment_answers (
   task_id TEXT PRIMARY KEY REFERENCES assessment_tasks(id),
   response_json TEXT NOT NULL
  );
  CREATE TABLE assessment_results (
   assessment_id TEXT PRIMARY KEY REFERENCES assessments(id),
   reviewed_at TEXT NOT NULL,
   result_json TEXT NOT NULL
  );
  INSERT INTO schema_migrations VALUES (14);
 `);
}
