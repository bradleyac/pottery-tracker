CREATE TABLE app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Seed default matching strategy
INSERT INTO app_config (key, value) VALUES ('matching_strategy', 'thumbnail');
