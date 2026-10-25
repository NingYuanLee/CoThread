ALTER TABLE wiki_questions
  MODIFY scope ENUM('project','org','company','web') NOT NULL DEFAULT 'project';
