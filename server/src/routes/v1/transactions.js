import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { Category, serializeCategory } from '../../models/category.js';
import { Transaction } from '../../models/transaction.js';
import { sendSuccess } from '../../utils/response.js';
import {
  transactionMutationSchema,
  transactionParamsSchema,
  transactionsQuerySchema,
} from '../../validation/transactions.js';

const transactionRouter = Router();

const getRangeStart = (value) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
const getRangeEnd = (value) => (value ? new Date(`${value}T23:59:59.999Z`) : null);

const advanceByRecurrence = (date, recurrence) => {
  if (recurrence === 'none') {
    return null;
  }

  const nextDate = new Date(date.getTime());

  switch (recurrence) {
    case 'daily':
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      break;
    case 'weekly':
      nextDate.setUTCDate(nextDate.getUTCDate() + 7);
      break;
    case 'biweekly':
      nextDate.setUTCDate(nextDate.getUTCDate() + 14);
      break;
    case 'monthly':
      nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
      break;
    case 'annually':
      nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
      break;
    default:
      return null;
  }

  return nextDate;
};

const computeNextOccurrenceAt = (date, recurrence, recurrenceEndDate) => {
  const nextDate = advanceByRecurrence(date, recurrence);

  if (!nextDate) {
    return null;
  }

  if (recurrenceEndDate && nextDate.getTime() > recurrenceEndDate.getTime()) {
    return null;
  }

  return nextDate;
};

const toCategoryPayload = (category) => (category ? serializeCategory(category) : null);

const serializeOccurrence = (transaction, occurrenceDate, options = {}) => {
  const transactionId = transaction._id.toString();
  const isProjected = Boolean(options.isProjected);

  return {
    id: isProjected ? `${transactionId}:${occurrenceDate.toISOString()}` : transactionId,
    originalTransactionId: transactionId,
    sourceDate: new Date(transaction.date).toISOString(),
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    paymentMethod: transaction.paymentMethod ?? null,
    date: occurrenceDate.toISOString(),
    occurrenceDate: occurrenceDate.toISOString(),
    description: transaction.description,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt?.toISOString?.() ?? null,
    isRecurring: Boolean(transaction.isRecurring),
    recurrence: transaction.recurrence ?? 'none',
    recurrenceEndDate: transaction.recurrenceEndDate
      ? transaction.recurrenceEndDate.toISOString()
      : null,
    nextOccurrenceAt: transaction.nextOccurrenceAt ? transaction.nextOccurrenceAt.toISOString() : null,
    isProjected,
    category: toCategoryPayload(transaction.categoryId),
  };
};

const expandTransactionForRange = (transaction, rangeStart, rangeEnd) => {
  const transactionDate = new Date(transaction.date);
  const transactionEndDate = transaction.recurrenceEndDate
    ? new Date(transaction.recurrenceEndDate)
    : null;
  const occurrences = [];

  const inRequestedRange = (date) => {
    if (rangeStart && date.getTime() < rangeStart.getTime()) {
      return false;
    }

    if (rangeEnd && date.getTime() > rangeEnd.getTime()) {
      return false;
    }

    return true;
  };

  if (!transaction.isRecurring || transaction.recurrence === 'none') {
    if (inRequestedRange(transactionDate)) {
      occurrences.push(serializeOccurrence(transaction, transactionDate, { isProjected: false }));
    }

    return occurrences;
  }

  let cursor = new Date(transactionDate.getTime());
  let isFirst = true;

  while (cursor) {
    if (transactionEndDate && cursor.getTime() > transactionEndDate.getTime()) {
      break;
    }

    if (rangeEnd && cursor.getTime() > rangeEnd.getTime()) {
      break;
    }

    if (inRequestedRange(cursor)) {
      occurrences.push(serializeOccurrence(transaction, cursor, { isProjected: !isFirst }));
    }

    const nextCursor = advanceByRecurrence(cursor, transaction.recurrence);

    if (!nextCursor || nextCursor.getTime() <= cursor.getTime()) {
      break;
    }

    cursor = nextCursor;
    isFirst = false;
  }

  return occurrences;
};

const sortTransactions = (transactions, sortOption = '-date') =>
  [...transactions].sort((left, right) => {
    if (sortOption === 'amount' || sortOption === '-amount') {
      if (left.amount !== right.amount) {
        return sortOption === 'amount' ? left.amount - right.amount : right.amount - left.amount;
      }
    } else {
      const leftDate = new Date(left.occurrenceDate).getTime();
      const rightDate = new Date(right.occurrenceDate).getTime();

      if (leftDate !== rightDate) {
        return sortOption === 'date' ? leftDate - rightDate : rightDate - leftDate;
      }
    }

    const leftDate = new Date(left.occurrenceDate).getTime();
    const rightDate = new Date(right.occurrenceDate).getTime();

    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }

    const leftCreatedAt = new Date(left.createdAt).getTime();
    const rightCreatedAt = new Date(right.createdAt).getTime();

    if (leftCreatedAt !== rightCreatedAt) {
      return rightCreatedAt - leftCreatedAt;
    }

    if (left.isProjected !== right.isProjected) {
      return Number(left.isProjected) - Number(right.isProjected);
    }

    return left.id.localeCompare(right.id);
  });

const buildAccessibleCategoryFilter = (userId) => ({
  $or: [{ isSystem: true }, { userId }],
});

const findAccessibleCategory = async (categoryId, userId) =>
  Category.findOne({
    _id: categoryId,
    ...buildAccessibleCategoryFilter(userId),
  });

const assertCategoryMatchesTransactionType = (category, transactionType) => {
  if (category.type !== transactionType) {
    throw new AppError({
      message: `Category "${category.name}" cannot be used for ${transactionType} transactions.`,
      statusCode: 400,
      code: 'CATEGORY_TYPE_MISMATCH',
    });
  }
};

const isInvestingContribution = (transactionType, category) =>
  transactionType === 'expense' && category?.slug === 'investing';

const getInvestingContributionAmount = (transactionType, amount, category) =>
  isInvestingContribution(transactionType, category) ? amount : 0;

const applyInvestingBalanceDelta = async (user, delta) => {
  if (!delta) {
    return;
  }

  const currentBalance =
    typeof user.investingAccountBalance === 'number' ? user.investingAccountBalance : 0;
  user.investingAccountBalance = Math.max(0, currentBalance + delta);
  await user.save();
};

const buildSearchFilter = async (userId, searchTerm) => {
  if (!searchTerm) {
    return null;
  }

  const regex = new RegExp(searchTerm, 'i');
  const matchingCategories = await Category.find({
    ...buildAccessibleCategoryFilter(userId),
    name: {
      $regex: regex,
    },
  }).select('_id');

  const categoryIds = matchingCategories.map((category) => category._id);
  const orConditions = [{ description: { $regex: regex } }];

  if (categoryIds.length > 0) {
    orConditions.push({ categoryId: { $in: categoryIds } });
  }

  return orConditions;
};

transactionRouter.get(
  '/',
  requireAuth,
  validateRequest({ query: transactionsQuerySchema }),
  async (req, res, next) => {
    try {
      const { from, to, search, categoryId, type, sort = '-date', page, limit } = req.query;
      const filters = {
        userId: req.authUser._id,
      };
      const rangeStart = getRangeStart(from);
      const rangeEnd = getRangeEnd(to);

      if (type) {
        filters.type = type;
      }

      if (categoryId) {
        filters.categoryId = categoryId;
      }

      const searchFilter = await buildSearchFilter(req.authUser._id, search);

      if (searchFilter) {
        filters.$or = searchFilter;
      }

      const transactions = await Transaction.find(filters)
        .populate('categoryId')
        .sort({ date: -1, createdAt: -1 });

      const expandedTransactions = sortTransactions(
        transactions.flatMap((transaction) => expandTransactionForRange(transaction, rangeStart, rangeEnd)),
        sort,
      );
      const shouldPaginate = typeof page === 'number' || typeof limit === 'number';
      const normalizedPage = typeof page === 'number' ? page : 1;
      const normalizedLimit = typeof limit === 'number' ? limit : 20;
      const total = expandedTransactions.length;
      const totalPages = shouldPaginate ? Math.max(1, Math.ceil(total / normalizedLimit)) : 1;
      const safePage = shouldPaginate ? Math.min(normalizedPage, totalPages) : 1;
      const paginatedTransactions = shouldPaginate
        ? expandedTransactions.slice((safePage - 1) * normalizedLimit, safePage * normalizedLimit)
        : expandedTransactions;

      sendSuccess(
        res,
        {
          transactions: paginatedTransactions,
        },
        200,
        {
          count: paginatedTransactions.length,
          projectedCount: paginatedTransactions.filter((transaction) => transaction.isProjected).length,
          sort,
          page: shouldPaginate ? safePage : null,
          limit: shouldPaginate ? normalizedLimit : null,
          total,
          totalPages: shouldPaginate ? totalPages : null,
        },
      );
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  '/',
  requireAuth,
  validateRequest({ body: transactionMutationSchema }),
  async (req, res, next) => {
    try {
      const {
        type,
        categoryId,
        amount,
        currency,
        date,
        description,
        paymentMethod,
        isRecurring,
        recurrence,
        recurrenceEndDate,
      } = req.body;
      const category = await findAccessibleCategory(categoryId, req.authUser._id);

      if (!category) {
        throw new AppError({
          message: 'Category not found.',
          statusCode: 404,
          code: 'CATEGORY_NOT_FOUND',
        });
      }

      assertCategoryMatchesTransactionType(category, type);

      const normalizedRecurrenceEndDate = isRecurring ? recurrenceEndDate : null;

      const transaction = await Transaction.create({
        userId: req.authUser._id,
        type,
        categoryId: category._id,
        amount,
        currency: currency ?? req.authUser.baseCurrency ?? 'RON',
        date,
        description,
        paymentMethod,
        isRecurring,
        recurrence,
        recurrenceEndDate: normalizedRecurrenceEndDate,
        nextOccurrenceAt: isRecurring
          ? computeNextOccurrenceAt(date, recurrence, normalizedRecurrenceEndDate)
          : null,
      });

      await applyInvestingBalanceDelta(
        req.authUser,
        getInvestingContributionAmount(type, amount, category),
      );

      const populatedTransaction = await Transaction.findById(transaction._id).populate('categoryId');

      sendSuccess(
        res,
        {
          transaction: serializeOccurrence(populatedTransaction, new Date(populatedTransaction.date)),
        },
        201,
      );
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.patch(
  '/:transactionId',
  requireAuth,
  validateRequest({ params: transactionParamsSchema, body: transactionMutationSchema }),
  async (req, res, next) => {
    try {
      const {
        type,
        categoryId,
        amount,
        currency,
        date,
        description,
        paymentMethod,
        isRecurring,
        recurrence,
        recurrenceEndDate,
      } = req.body;
      const transaction = await Transaction.findOne({
        _id: req.params.transactionId,
        userId: req.authUser._id,
      }).populate('categoryId');

      if (!transaction) {
        throw new AppError({
          message: 'Transaction not found.',
          statusCode: 404,
          code: 'TRANSACTION_NOT_FOUND',
        });
      }

      const nextCategory = await findAccessibleCategory(categoryId, req.authUser._id);

      if (!nextCategory) {
        throw new AppError({
          message: 'Category not found.',
          statusCode: 404,
          code: 'CATEGORY_NOT_FOUND',
        });
      }

      assertCategoryMatchesTransactionType(nextCategory, type);

      const normalizedRecurrenceEndDate = isRecurring ? recurrenceEndDate : null;
      const previousContribution = getInvestingContributionAmount(
        transaction.type,
        transaction.amount,
        transaction.categoryId,
      );
      const nextContribution = getInvestingContributionAmount(type, amount, nextCategory);

      transaction.type = type;
      transaction.categoryId = nextCategory._id;
      transaction.amount = amount;
      transaction.currency = currency ?? transaction.currency ?? req.authUser.baseCurrency ?? 'RON';
      transaction.date = date;
      transaction.description = description;
      transaction.paymentMethod = paymentMethod;
      transaction.isRecurring = isRecurring;
      transaction.recurrence = recurrence;
      transaction.recurrenceEndDate = normalizedRecurrenceEndDate;
      transaction.nextOccurrenceAt = isRecurring
        ? computeNextOccurrenceAt(date, recurrence, normalizedRecurrenceEndDate)
        : null;

      await transaction.save();
      await applyInvestingBalanceDelta(req.authUser, nextContribution - previousContribution);

      const populatedTransaction = await Transaction.findById(transaction._id).populate('categoryId');

      sendSuccess(res, {
        transaction: serializeOccurrence(populatedTransaction, new Date(populatedTransaction.date)),
      });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.delete(
  '/:transactionId',
  requireAuth,
  validateRequest({ params: transactionParamsSchema }),
  async (req, res, next) => {
    try {
      const transaction = await Transaction.findOne({
        _id: req.params.transactionId,
        userId: req.authUser._id,
      }).populate('categoryId');

      if (!transaction) {
        throw new AppError({
          message: 'Transaction not found.',
          statusCode: 404,
          code: 'TRANSACTION_NOT_FOUND',
        });
      }

      const contributionAmount = getInvestingContributionAmount(
        transaction.type,
        transaction.amount,
        transaction.categoryId,
      );

      await Transaction.deleteOne({ _id: transaction._id, userId: req.authUser._id });
      await applyInvestingBalanceDelta(req.authUser, -contributionAmount);

      sendSuccess(res, {
        deleted: true,
        transactionId: transaction._id.toString(),
      });
    } catch (error) {
      next(error);
    }
  },
);

export { transactionRouter };
