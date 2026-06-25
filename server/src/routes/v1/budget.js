import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { Transaction } from '../../models/transaction.js';
import { sendSuccess } from '../../utils/response.js';
import { budgetSummaryQuerySchema } from '../../validation/budget.js';

const budgetRouter = Router();

const toMoney = (value) => Number(Number(value).toFixed(2));

const getMonthBoundsUtc = (year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return {
    monthStart,
    monthEnd,
  };
};

budgetRouter.get(
  '/summary',
  requireAuth,
  validateRequest({ query: budgetSummaryQuerySchema }),
  async (req, res, next) => {
    try {
      const { year, month } = req.query;
      const { monthStart, monthEnd } = getMonthBoundsUtc(year, month);

      const transactions = await Transaction.find({
        userId: req.authUser._id,
        date: {
          $gte: monthStart,
          $lt: monthEnd,
        },
      }).select('type amount');

      const totals = transactions.reduce(
        (accumulator, transaction) => {
          const amount = Math.abs(Number(transaction.amount || 0));

          if (!Number.isFinite(amount) || amount <= 0) {
            return accumulator;
          }

          if (transaction.type === 'income') {
            accumulator.income += amount;
            return accumulator;
          }

          if (transaction.type === 'expense') {
            accumulator.expense += amount;
          }

          return accumulator;
        },
        { income: 0, expense: 0 },
      );

      const rawBudgetGoal = Number(req.authUser.monthlyBudgetGoal);
      const budgetGoal = Number.isFinite(rawBudgetGoal) && rawBudgetGoal > 0 ? rawBudgetGoal : null;
      const incomeTotal = toMoney(totals.income);
      const expenseTotal = toMoney(totals.expense);
      const remainingBudget = budgetGoal !== null ? toMoney(budgetGoal - expenseTotal) : null;

      sendSuccess(res, {
        monthStart: monthStart.toISOString(),
        monthEnd: monthEnd.toISOString(),
        currency: req.authUser.baseCurrency ?? 'RON',
        budgetGoal,
        incomeTotal,
        expenseTotal,
        remainingBudget,
      });
    } catch (error) {
      next(error);
    }
  },
);

export { budgetRouter };
