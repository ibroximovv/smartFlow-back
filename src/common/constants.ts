export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  REQUESTER = 'REQUESTER',
  REVIEWER = 'REVIEWER',
  APPROVER = 'APPROVER',
}

export enum DocumentType {
  EXPENSE = 'EXPENSE',
  LEAVE = 'LEAVE',
  ASSET = 'ASSET',
}

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum DocumentAction {
  CREATE = 'CREATE',
  SUBMIT = 'SUBMIT',
  REVIEW = 'REVIEW',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_CHANGES = 'REQUEST_CHANGES',
}

export enum Department {
  IT = 'IT',
  HR = 'HR',
  FINANCE = 'FINANCE',
  OPERATIONS = 'OPERATIONS',
  MARKETING = 'MARKETING',
}

export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
}

export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
}

export enum AssetType {
  LAPTOP = 'LAPTOP',
  PHONE = 'PHONE',
  FURNITURE = 'FURNITURE',
  OTHER = 'OTHER',
}