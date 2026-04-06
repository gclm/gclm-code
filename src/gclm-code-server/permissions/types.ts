export type PermissionRequestStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'cancelled'

export type PermissionScope = 'once' | 'session'

export type PermissionRequestRecord = {
  id: string
  sessionId: string
  toolName: string
  toolUseId: string
  status: PermissionRequestStatus
  scope: PermissionScope
  inputJson: string
  requestedByChannel?: string
  requestedByUserId?: string
  resolutionChannel?: string
  resolvedBy?: string
  resolutionMessage?: string
  requestedAt: string
  expiresAt?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}
