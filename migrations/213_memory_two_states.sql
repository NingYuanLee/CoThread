-- Writers have been cut over. Candidate/job/iteration workflow states are separate.
UPDATE wiki_pages SET status='current' WHERE status='draft';
ALTER TABLE wiki_pages MODIFY status ENUM('current','superseded') NOT NULL;
ALTER TABLE memory_relations MODIFY relation ENUM('relates','derives','supersedes','corrects') NOT NULL;
