import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { z } from 'zod';
import type { AppConfig } from './config/env.js';
import type { RefreshTokenRecord, StatementRecord, UserRecord } from './domain/types.js';
import type { DataStore, FileStore } from './infrastructure/store.js';
import { authenticate } from './middleware/authenticate.js';
import { AppError } from './shared/errors.js';

const asyncRoute =
  (handler: (request: Request, response: Response) => Promise<void>): RequestHandler =>
  (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response).catch((error: unknown) => next(error));
  };
const userDto = (user: {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});
const statementDto = (statement: StatementRecord, count: number) => ({
  id: statement.id,
  fileName: statement.fileName,
  bankCode: statement.bankCode,
  status: statement.status,
  failureCode: statement.failureCode,
  failureMessage: statement.failureMessage,
  uploadedAt: statement.uploadedAt,
  processedAt: statement.processedAt,
  transactionCount: count,
});
const detectedBanks: Record<string, string[]> = {
  ACCESS: ['access bank', 'access more than banking'],
  FIDELITY: ['fidelity bank', 'fidelity'],
  FIRSTBANK: ['first bank of nigeria', 'firstbank'],
  GTBANK: ['guaranty trust bank', 'gtbank'],
  ZENITH: ['zenith bank'],
};
function detectBank(text: string): string | null {
  const normalized = text.toLowerCase();
  return (
    Object.entries(detectedBanks).find(([, markers]) =>
      markers.some((marker) => normalized.includes(marker)),
    )?.[0] ?? null
  );
}
function ownedUserId(request: Request): string {
  const user = (request as Request & { user?: { id: string } }).user;
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return user.id;
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Check the submitted fields.',
      z.flattenError(result.error).fieldErrors as Record<string, string[]>,
    );
  return result.data;
}

const refreshTokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

function accessToken(user: UserRecord, config: AppConfig): string {
  return jwt.sign({ role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>,
  });
}

function newRefreshToken(
  userId: string,
  expiresDays: number,
): {
  raw: string;
  record: RefreshTokenRecord;
} {
  const raw = randomBytes(48).toString('base64url');
  const now = new Date();
  return {
    raw,
    record: {
      id: randomUUID(),
      userId,
      tokenHash: refreshTokenHash(raw),
      expiresAt: new Date(now.getTime() + expiresDays * 86_400_000).toISOString(),
      createdAt: now.toISOString(),
      revokedAt: null,
      replacedById: null,
    },
  };
}

export interface RouteDependencies {
  config: AppConfig;
  store: DataStore;
  files: FileStore;
}
export function createRoutes({ config, store, files }: RouteDependencies): Router {
  const router = Router();
  const protectedRoute = authenticate(config.JWT_SECRET);
  router.post(
    '/auth/register',
    asyncRoute(async (request, response) => {
      const body = parse(
        z
          .object({
            name: z.string().trim().min(2).max(100),
            email: z.email(),
            password: z.string().min(8).max(128),
          })
          .strict(),
        request.body,
      );
      const email = body.email.toLowerCase();
      const passwordHash = await hash(body.password, 12);
      const refresh = newRefreshToken(randomUUID(), config.REFRESH_TOKEN_EXPIRES_DAYS);
      const user = await store.write((state) => {
        if (state.users.some((item) => item.email === email))
          throw new AppError(409, 'CONFLICT', 'An account with this email already exists.');
        const created = {
          id: refresh.record.userId,
          name: body.name,
          email,
          passwordHash,
          role: 'USER' as const,
          createdAt: new Date().toISOString(),
        };
        state.users.push(created);
        state.refreshTokens.push(refresh.record);
        return created;
      });
      response.status(201).json({
        data: { user: userDto(user), token: accessToken(user, config), refreshToken: refresh.raw },
      });
    }),
  );
  router.post(
    '/auth/login',
    asyncRoute(async (request, response) => {
      const body = parse(
        z.object({ email: z.email(), password: z.string().min(1) }).strict(),
        request.body,
      );
      const user = store.read((state) =>
        state.users.find((item) => item.email === body.email.toLowerCase()),
      );
      if (!user || !(await compare(body.password, user.passwordHash)))
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      const refresh = newRefreshToken(user.id, config.REFRESH_TOKEN_EXPIRES_DAYS);
      await store.write((state) => {
        const now = new Date().toISOString();
        state.refreshTokens = state.refreshTokens.filter(
          (item) => item.expiresAt > now || item.revokedAt === null,
        );
        state.refreshTokens.push(refresh.record);
      });
      response.json({
        data: { user: userDto(user), token: accessToken(user, config), refreshToken: refresh.raw },
      });
    }),
  );
  router.post(
    '/auth/refresh',
    asyncRoute(async (request, response) => {
      const body = parse(
        z.object({ refreshToken: z.string().min(32).max(500) }).strict(),
        request.body,
      );
      const presentedHash = refreshTokenHash(body.refreshToken);
      const rotated = await store.write((state) => {
        const now = new Date().toISOString();
        const current = state.refreshTokens.find((item) => item.tokenHash === presentedHash);
        if (!current || current.revokedAt || current.expiresAt <= now)
          throw new AppError(
            401,
            'INVALID_REFRESH_TOKEN',
            'The refresh token is invalid or expired.',
          );
        const user = state.users.find((item) => item.id === current.userId);
        if (!user)
          throw new AppError(
            401,
            'INVALID_REFRESH_TOKEN',
            'The refresh token is invalid or expired.',
          );
        const next = newRefreshToken(user.id, config.REFRESH_TOKEN_EXPIRES_DAYS);
        current.revokedAt = now;
        current.replacedById = next.record.id;
        state.refreshTokens.push(next.record);
        return { user, refreshToken: next.raw };
      });
      response.json({
        data: {
          user: userDto(rotated.user),
          token: accessToken(rotated.user, config),
          refreshToken: rotated.refreshToken,
        },
      });
    }),
  );
  router.get('/auth/me', protectedRoute, (request, response) => {
    const user = store.read((state) =>
      state.users.find((item) => item.id === ownedUserId(request)),
    );
    if (!user) throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    response.json({ data: userDto(user) });
  });
  router.post(
    '/auth/logout',
    protectedRoute,
    asyncRoute(async (request, response) => {
      const body = parse(
        z.object({ refreshToken: z.string().min(32).max(500).optional() }).strict(),
        request.body ?? {},
      );
      if (body.refreshToken) {
        const userId = ownedUserId(request);
        const tokenHash = refreshTokenHash(body.refreshToken);
        await store.write((state) => {
          const token = state.refreshTokens.find(
            (item) => item.userId === userId && item.tokenHash === tokenHash,
          );
          if (token && !token.revokedAt) token.revokedAt = new Date().toISOString();
        });
      }
      response.status(204).send();
    }),
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: config.MAX_UPLOAD_FILES, fileSize: config.MAX_UPLOAD_FILE_BYTES },
  });
  router.post(
    '/statements/upload',
    protectedRoute,
    upload.array('files', config.MAX_UPLOAD_FILES),
    asyncRoute(async (request, response) => {
      const userId = ownedUserId(request);
      const inputs = request.files as Express.Multer.File[] | undefined;
      if (!inputs?.length) throw new AppError(400, 'VALIDATION_ERROR', 'Select at least one PDF.');
      const items: Array<Record<string, unknown> & { status: string }> = [];
      for (const file of inputs) {
        const base = { fileName: file.originalname };
        if (
          file.mimetype !== 'application/pdf' ||
          !file.originalname.toLowerCase().endsWith('.pdf')
        ) {
          items.push({
            ...base,
            statementId: null,
            status: 'FAILED',
            bankCode: null,
            transactionCount: 0,
            error: { code: 'UNSUPPORTED_FILE_TYPE', message: 'Only PDF files are supported.' },
          });
          continue;
        }
        if (file.buffer.subarray(0, 5).toString() !== '%PDF-') {
          items.push({
            ...base,
            statementId: null,
            status: 'FAILED',
            bankCode: null,
            transactionCount: 0,
            error: { code: 'INVALID_PDF', message: 'The file is not a valid PDF.' },
          });
          continue;
        }
        const fileHash = createHash('sha256').update(file.buffer).digest('hex');
        const duplicate = store.read((state) =>
          state.statements.find((item) => item.userId === userId && item.fileHash === fileHash),
        );
        if (duplicate) {
          items.push({
            ...base,
            statementId: duplicate.id,
            status: 'DUPLICATE',
            bankCode: duplicate.bankCode,
            transactionCount: 0,
            error: { code: 'DUPLICATE_STATEMENT', message: 'This statement was already uploaded.' },
          });
          continue;
        }
        const storageKey = await files.put(file.buffer);
        const text = file.buffer.toString('latin1');
        const bankCode = detectBank(text);
        const now = new Date().toISOString();
        const statement: StatementRecord = {
          id: randomUUID(),
          userId,
          fileName: file.originalname.replace(/[\r\n]/g, ''),
          fileHash,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey,
          bankCode,
          status: bankCode ? 'PROCESSED' : 'NEEDS_BANK',
          failureCode: bankCode ? null : 'BANK_DETECTION_REQUIRED',
          failureMessage: bankCode ? null : 'Select the issuing bank to continue.',
          uploadedAt: now,
          processedAt: bankCode ? now : null,
        };
        try {
          await store.write((state) => {
            if (
              state.statements.some((item) => item.userId === userId && item.fileHash === fileHash)
            )
              throw new AppError(
                409,
                'DUPLICATE_STATEMENT',
                'This statement was already uploaded.',
              );
            state.statements.push(statement);
          });
        } catch (error) {
          await files.delete(storageKey);
          throw error;
        }
        items.push({
          ...base,
          statementId: statement.id,
          status: statement.status,
          bankCode,
          transactionCount: 0,
          error: bankCode
            ? null
            : { code: 'BANK_DETECTION_REQUIRED', message: statement.failureMessage },
        });
      }
      const count = (status: string) => items.filter((item) => item.status === status).length;
      response.status(207).json({
        data: {
          summary: {
            total: items.length,
            processed: count('PROCESSED'),
            needsBank: count('NEEDS_BANK'),
            duplicate: count('DUPLICATE'),
            failed: count('FAILED'),
          },
          items,
        },
      });
    }),
  );
  router.get('/statements', protectedRoute, (request, response) => {
    const userId = ownedUserId(request);
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));
    const all = store.read((state) =>
      state.statements
        .filter((item) => item.userId === userId)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .map((item) =>
          statementDto(item, state.transactions.filter((x) => x.statementId === item.id).length),
        ),
    );
    response.json({
      data: all.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: all.length },
    });
  });
  router.get('/statements/:id', protectedRoute, (request, response) => {
    const userId = ownedUserId(request);
    const result = store.read((state) => {
      const item = state.statements.find((x) => x.id === request.params.id && x.userId === userId);
      return item
        ? statementDto(item, state.transactions.filter((x) => x.statementId === item.id).length)
        : null;
    });
    if (!result) throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
    response.json({ data: result });
  });
  router.post(
    '/statements/:id/reprocess',
    protectedRoute,
    asyncRoute(async (request, response) => {
      const userId = ownedUserId(request);
      const body = parse(
        z
          .object({
            bankCode: z.enum(['ACCESS', 'FIDELITY', 'FIRSTBANK', 'GTBANK', 'ZENITH']),
            confirmReplaceCorrections: z.boolean().optional(),
          })
          .strict(),
        request.body,
      );
      const updated = await store.write((state) => {
        const statement = state.statements.find(
          (x) => x.id === request.params.id && x.userId === userId,
        );
        if (!statement)
          throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
        const ids = state.transactions
          .filter((x) => x.statementId === statement.id && x.isUserCorrected)
          .map((x) => x.id);
        if (ids.length && !body.confirmReplaceCorrections)
          throw new AppError(
            409,
            'REPROCESS_CONFIRMATION_REQUIRED',
            'Confirm replacement of corrected transactions.',
          );
        state.corrections = state.corrections.filter((x) => !ids.includes(x.transactionId));
        state.transactions = state.transactions.filter((x) => x.statementId !== statement.id);
        statement.bankCode = body.bankCode;
        statement.status = 'PROCESSED';
        statement.failureCode = null;
        statement.failureMessage = null;
        statement.processedAt = new Date().toISOString();
        return statementDto(statement, 0);
      });
      response.json({ data: updated });
    }),
  );
  router.delete(
    '/statements/:id',
    protectedRoute,
    asyncRoute(async (request, response) => {
      const userId = ownedUserId(request);
      const removed = await store.write((state) => {
        const index = state.statements.findIndex(
          (x) => x.id === request.params.id && x.userId === userId,
        );
        if (index < 0)
          throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
        const [statement] = state.statements.splice(index, 1);
        const ids = state.transactions
          .filter((x) => x.statementId === statement!.id)
          .map((x) => x.id);
        state.transactions = state.transactions.filter((x) => x.statementId !== statement!.id);
        state.corrections = state.corrections.filter((x) => !ids.includes(x.transactionId));
        return statement!;
      });
      await files.delete(removed.storageKey);
      response.status(204).send();
    }),
  );

  router.get('/categories', protectedRoute, (_request, response) =>
    response.json({
      data: store.read((state) => state.categories.sort((a, b) => a.displayOrder - b.displayOrder)),
    }),
  );
  router.get('/transactions', protectedRoute, (request, response) => {
    const userId = ownedUserId(request);
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));
    let items = store.read((state) => state.transactions.filter((x) => x.userId === userId));
    if (typeof request.query.bank === 'string')
      items = items.filter((x) => x.bankCode === request.query.bank);
    if (typeof request.query.category === 'string')
      items = items.filter((x) => x.categoryId === request.query.category);
    if (typeof request.query.type === 'string')
      items = items.filter((x) => x.type === request.query.type);
    if (typeof request.query.search === 'string') {
      const search = request.query.search.trim().toLowerCase();
      items = items.filter((x) => x.description.toLowerCase().includes(search));
    }
    items.sort((a, b) => b.date.localeCompare(a.date));
    response.json({
      data: items.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: items.length },
    });
  });
  router.patch(
    '/transactions/:id',
    protectedRoute,
    asyncRoute(async (request, response) => {
      const userId = ownedUserId(request);
      const body = parse(
        z
          .object({
            date: z.iso.date().optional(),
            description: z.string().trim().min(1).max(500).optional(),
            amountMinor: z.number().int().nonnegative().optional(),
            type: z.enum(['INCOME', 'EXPENSE']).optional(),
            categoryId: z.string().optional(),
          })
          .strict()
          .refine((x) => Object.keys(x).length > 0),
        request.body,
      );
      const updated = await store.write((state) => {
        const item = state.transactions.find(
          (x) => x.id === request.params.id && x.userId === userId,
        );
        if (!item) throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found.');
        if (body.categoryId && !state.categories.some((x) => x.id === body.categoryId))
          throw new AppError(400, 'VALIDATION_ERROR', 'Category is invalid.');
        const before = { ...item };
        Object.assign(item, body, {
          reviewStatus: 'USER_CORRECTED',
          isUserCorrected: true,
          updatedAt: new Date().toISOString(),
        });
        state.corrections.push({
          id: randomUUID(),
          transactionId: item.id,
          userId,
          changedFields: Object.keys(body),
          before,
          after: { ...item },
          createdAt: new Date().toISOString(),
        });
        return item;
      });
      response.json({ data: updated });
    }),
  );
  router.get('/dashboard', protectedRoute, (request, response) => {
    const userId = ownedUserId(request);
    let items = store.read((state) => state.transactions.filter((x) => x.userId === userId));
    if (typeof request.query.bank === 'string')
      items = items.filter((x) => x.bankCode === request.query.bank);
    const income = items
      .filter((x) => x.type === 'INCOME')
      .reduce((sum, x) => sum + x.amountMinor, 0);
    const expenses = items
      .filter((x) => x.type === 'EXPENSE')
      .reduce((sum, x) => sum + x.amountMinor, 0);
    const categoryMap = new Map<string, number>();
    for (const item of items.filter((x) => x.type === 'EXPENSE'))
      categoryMap.set(item.categoryId, (categoryMap.get(item.categoryId) ?? 0) + item.amountMinor);
    response.json({
      data: {
        currency: 'NGN',
        totalIncomeMinor: income,
        totalExpensesMinor: expenses,
        netCashFlowMinor: income - expenses,
        transactionCount: items.length,
        spendingByCategory: [...categoryMap].map(([categoryId, amountMinor]) => ({
          categoryId,
          amountMinor,
        })),
        spendingTrend: [],
        spendingByBank: [],
        recentTransactions: items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
      },
    });
  });
  return router;
}
