CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL,
  project_id TEXT,
  workspace_id TEXT,
  owner_user_id TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  execution_session_ref TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_active_at TEXT,
  archived_at TEXT
);

CREATE INDEX idx_sessions_owner_updated
  ON sessions(owner_user_id, updated_at DESC);

CREATE INDEX idx_sessions_status_updated
  ON sessions(status, updated_at DESC);

CREATE INDEX idx_sessions_project_updated
  ON sessions(project_id, updated_at DESC);

CREATE TABLE channel_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  tenant_scope TEXT NOT NULL DEFAULT '',
  tenant_id TEXT,
  display_name TEXT,
  profile_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX uq_channel_identities_provider_user_tenant
  ON channel_identities(provider, provider_user_id, tenant_scope);

CREATE TABLE session_bindings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel_identity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  binding_type TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  last_message_id TEXT,
  last_active_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(channel_identity_id) REFERENCES channel_identities(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_bindings_session
  ON session_bindings(session_id, updated_at DESC);

CREATE INDEX idx_session_bindings_user_active
  ON session_bindings(user_id, updated_at DESC);

CREATE INDEX idx_session_bindings_identity_active
  ON session_bindings(channel_identity_id, updated_at DESC);

CREATE UNIQUE INDEX uq_session_bindings_identity_session
  ON session_bindings(channel_identity_id, session_id);

CREATE TABLE permission_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_use_id TEXT NOT NULL,
  status TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'once',
  input_json TEXT NOT NULL,
  requested_by_channel TEXT,
  requested_by_user_id TEXT,
  resolution_channel TEXT,
  resolved_by TEXT,
  resolution_message TEXT,
  requested_at TEXT NOT NULL,
  expires_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_permission_requests_session_status
  ON permission_requests(session_id, status, requested_at DESC);

CREATE INDEX idx_permission_requests_status_expires
  ON permission_requests(status, expires_at);

CREATE UNIQUE INDEX uq_permission_requests_tool_use
  ON permission_requests(session_id, tool_use_id);

CREATE TABLE webhook_idempotency (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT,
  key_source TEXT NOT NULL,
  event_type TEXT,
  status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT,
  response_snapshot_json TEXT
);

CREATE UNIQUE INDEX uq_webhook_idempotency_provider_key
  ON webhook_idempotency(provider, idempotency_key);

CREATE INDEX idx_webhook_idempotency_expires
  ON webhook_idempotency(expires_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  channel TEXT,
  request_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_events_session_created
  ON audit_events(session_id, created_at DESC);

CREATE INDEX idx_audit_events_type_created
  ON audit_events(event_type, created_at DESC);
