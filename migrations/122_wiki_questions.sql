-- 项目内有问必答。一个成员、一个项目、一份记录。不进群聊。
CREATE TABLE wiki_questions (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY wiki_questions_room (project_id, user_id, created_at),
  CONSTRAINT fk_wiki_questions_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_wiki_questions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE wiki_answers (
  id CHAR(36) NOT NULL,
  question_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY wiki_answers_question (question_id),
  CONSTRAINT fk_wiki_answers_question FOREIGN KEY (question_id) REFERENCES wiki_questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE wiki_answer_citations (
  id CHAR(36) NOT NULL,
  answer_id CHAR(36) NOT NULL,
  page_id CHAR(36) NOT NULL,
  label VARCHAR(240) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY wiki_answer_citations_answer (answer_id),
  CONSTRAINT fk_wiki_answer_citations_answer FOREIGN KEY (answer_id) REFERENCES wiki_answers(id),
  CONSTRAINT fk_wiki_answer_citations_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
