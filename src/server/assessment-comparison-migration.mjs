export function migrateAssessmentComparisons(db) {
 db.exec(`
  CREATE TABLE assessment_comparisons (
   id TEXT PRIMARY KEY,
   notion_id TEXT NOT NULL REFERENCES notions(id),
   first_assessment_id TEXT NOT NULL REFERENCES assessment_results(assessment_id),
   second_assessment_id TEXT NOT NULL REFERENCES assessment_results(assessment_id),
   first_context TEXT NOT NULL,
   second_context TEXT NOT NULL,
   rationale TEXT NOT NULL,
   criteria_json TEXT NOT NULL,
   published_at TEXT NOT NULL,
   CHECK(first_assessment_id <> second_assessment_id)
  );
  CREATE UNIQUE INDEX assessment_comparison_pair ON assessment_comparisons (
   notion_id, min(first_assessment_id, second_assessment_id), max(first_assessment_id, second_assessment_id)
  );
  CREATE INDEX assessment_comparison_date ON assessment_comparisons(published_at DESC, id);
  INSERT INTO schema_migrations VALUES (15);
 `);
}
