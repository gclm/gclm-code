-- Rename permission_requests: requested_by_channel -> requested_by_provider
ALTER TABLE permission_requests RENAME COLUMN requested_by_channel TO requested_by_provider;

-- Rename permission_requests: resolution_channel -> resolved_by_provider
ALTER TABLE permission_requests RENAME COLUMN resolution_channel TO resolved_by_provider;

-- Rename audit_events: channel -> provider
ALTER TABLE audit_events RENAME COLUMN channel TO provider;
