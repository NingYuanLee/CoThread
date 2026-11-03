CREATE TABLE project_memory_run_phases (
  run_id CHAR(36) NOT NULL,
  phase VARCHAR(20) NOT NULL,
  result JSON NOT NULL,
  PRIMARY KEY (run_id,phase),
  CONSTRAINT fk_project_memory_phase_run FOREIGN KEY (run_id) REFERENCES agent_laoweng_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
