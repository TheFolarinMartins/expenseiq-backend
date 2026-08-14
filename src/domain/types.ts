export type Role = 'USER' | 'ADMIN';
export type StatementStatus = 'PROCESSING' | 'NEEDS_BANK' | 'PROCESSED' | 'FAILED';
export type TransactionType = 'INCOME' | 'EXPENSE';
export type ReviewStatus = 'OK' | 'REVIEW_REQUIRED' | 'USER_CORRECTED';
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}
export interface StatementRecord {
  id: string;
  userId: string;
  fileName: string;
  fileHash: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  bankCode: string | null;
  status: StatementStatus;
  failureCode: string | null;
  failureMessage: string | null;
  uploadedAt: string;
  processedAt: string | null;
}
export interface TransactionRecord {
  id: string;
  statementId: string;
  userId: string;
  bankCode: string;
  date: string;
  description: string;
  amountMinor: number;
  type: TransactionType;
  balanceMinor: number | null;
  categoryId: string;
  confidenceScore: number;
  reviewStatus: ReviewStatus;
  isUserCorrected: boolean;
  rawDescription: string;
  rawAmount: string;
  rawDate: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CorrectionRecord {
  id: string;
  transactionId: string;
  userId: string;
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
}
export interface CategoryRecord {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
}
export interface DatabaseState {
  users: UserRecord[];
  statements: StatementRecord[];
  transactions: TransactionRecord[];
  corrections: CorrectionRecord[];
  categories: CategoryRecord[];
}
