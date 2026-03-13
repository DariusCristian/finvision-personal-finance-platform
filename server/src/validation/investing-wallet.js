import { z } from 'zod';

export const investingWalletUpdateSchema = z.object({
  monthlyGoal: z.coerce.number().min(0).optional(),
  autoFundEnabled: z.coerce.boolean().optional(),
  autoFundAmount: z.coerce.number().min(0).optional(),
  autoFundDayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
});

export const investingWalletDepositSchema = z.object({
  amountRON: z.coerce.number().positive('Amount must be greater than zero.'),
  note: z.string().trim().max(240).optional(),
});

export const investingWalletConvertSchema = z.object({
  amountRON: z.coerce.number().positive('Amount must be greater than zero.'),
});

export const investingWalletConvertQuoteQuerySchema = z.object({
  amountRON: z.coerce.number().positive('Amount must be greater than zero.'),
});

export const investingWalletLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(20),
});

export const investingWalletSummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
