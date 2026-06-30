-- Schéma D1 pour la journalisation anonyme des conversations de l'assistant.
-- À exécuter une fois dans la console D1 (Cloudflare → Workers & Pages → D1 → votre base → Console).
CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT,        -- identifiant de session ALÉATOIRE (anonyme, aucune donnée perso)
  created_at  INTEGER,     -- horodatage epoch (ms)
  question    TEXT,        -- message du visiteur
  answer      TEXT         -- réponse de l'assistant
);
CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conv_time    ON conversations(created_at);

-- Lire les conversations (les plus récentes en premier) :
--   SELECT session_id, datetime(created_at/1000,'unixepoch') AS le, question, answer
--   FROM conversations ORDER BY created_at DESC LIMIT 100;
