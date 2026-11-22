export function migrateNotionProgress(db) {
 db.exec(`
  CREATE TABLE item_version_notions (
   version_id TEXT NOT NULL REFERENCES item_versions(id),
   notion_id TEXT NOT NULL REFERENCES notions(id),
   PRIMARY KEY(version_id,notion_id)
  );
  CREATE INDEX item_version_notions_by_notion ON item_version_notions(notion_id,version_id);
  INSERT INTO item_version_notions
   SELECT b.current_version_id,n.notion_id FROM bank_items b JOIN item_notions n ON n.item_id=b.id;
  CREATE TABLE proactive_lesson_prerequisites (
   lesson_id TEXT PRIMARY KEY REFERENCES proactive_lessons(id),
   notion_id TEXT NOT NULL REFERENCES notions(id)
  );
  INSERT INTO schema_migrations(version) VALUES (13);
 `);
}
