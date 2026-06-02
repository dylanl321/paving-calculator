-- Add email_verified column to users table
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

-- Create email_tokens table for verification and password reset
CREATE TABLE IF NOT EXISTS email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- "verify_email" | "reset_password"
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_email_tokens_token ON email_tokens(token);
CREATE INDEX idx_email_tokens_user_type ON email_tokens(user_id, type);
