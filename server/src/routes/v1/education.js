import mongoose from 'mongoose';
import { Router } from 'express';

import { AppError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { Article } from '../../models/article.js';
import { Question } from '../../models/question.js';
import { QuizAttempt } from '../../models/quiz-attempt.js';
import { Quiz } from '../../models/quiz.js';
import { UserProgress } from '../../models/user-progress.js';
import { sendSuccess } from '../../utils/response.js';
import {
  articleCompleteParamsSchema,
  articleIdentifierParamsSchema,
  articleListQuerySchema,
  quizAttemptBodySchema,
  quizIdParamsSchema,
  quizListQuerySchema,
} from '../../validation/education.js';

const educationRouter = Router();

const toObjectId = (value) => new mongoose.Types.ObjectId(value);
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const serializeArticleSummary = (article) => ({
  id: article._id.toString(),
  title: article.title,
  slug: article.slug,
  category: article.category,
  difficulty: article.difficulty,
  excerpt: article.excerpt,
  estimatedMinutes: article.estimatedMinutes,
  tags: article.tags,
  createdAt: article.createdAt.toISOString(),
  updatedAt: article.updatedAt.toISOString(),
});

const serializeArticleDetail = (article) => ({
  ...serializeArticleSummary(article),
  contentBlocks: article.contentBlocks,
});

const serializeQuizSummary = (quiz, questionCount = 0) => ({
  id: quiz._id.toString(),
  title: quiz.title,
  category: quiz.category,
  difficulty: quiz.difficulty,
  passingScore: quiz.passingScore,
  questionCount,
  createdAt: quiz.createdAt.toISOString(),
  updatedAt: quiz.updatedAt.toISOString(),
});

const serializeProgress = ({ progress, quizAccuracyPct, recentAttempts }) => ({
  xp: progress.xp,
  level: progress.level,
  streakDays: progress.streakDays,
  lastActiveAt: progress.lastActiveAt,
  completedArticlesCount: progress.completedArticleIds.length,
  quizAccuracyPct,
  recentAttempts,
});

const computeLevel = (xp) => Math.max(1, Math.floor(xp / 100) + 1);

const getOrCreateProgress = async (userId) => {
  const progress =
    (await UserProgress.findOne({ userId })) ??
    (await UserProgress.create({ userId }));

  return progress;
};

const getArticleByIdentifier = async (idOrSlug) => {
  if (isObjectId(idOrSlug)) {
    const byId = await Article.findById(idOrSlug);

    if (byId) {
      return byId;
    }
  }

  return Article.findOne({ slug: idOrSlug.toLowerCase() });
};

const getRecommendedNextQuiz = async (userId, currentQuiz) => {
  const recentAttempts = await QuizAttempt.find({ userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('quizId');

  const recentQuizIdSet = new Set(recentAttempts.map((attempt) => attempt.quizId.toString()));

  const excludedQuizIds = [currentQuiz._id, ...[...recentQuizIdSet].map((id) => toObjectId(id))];

  const nextQuiz = await Quiz.findOne({
    _id: { $nin: excludedQuizIds },
    category: currentQuiz.category,
    difficulty: 'beginner',
  }).sort({ createdAt: -1 });

  if (!nextQuiz) {
    return null;
  }

  return {
    type: 'quiz',
    id: nextQuiz._id.toString(),
    title: nextQuiz.title,
    category: nextQuiz.category,
  };
};

educationRouter.get(
  '/articles',
  validateRequest({ query: articleListQuerySchema }),
  async (req, res, next) => {
    try {
      const { category, difficulty, search } = req.query;
      const filters = {};

      if (category) {
        filters.category = category;
      }

      if (difficulty) {
        filters.difficulty = difficulty;
      }

      if (search) {
        const regex = new RegExp(search, 'i');
        filters.$or = [{ title: { $regex: regex } }, { excerpt: { $regex: regex } }, { tags: { $in: [regex] } }];
      }

      const articles = await Article.find(filters).sort({ createdAt: -1 });

      sendSuccess(
        res,
        {
          articles: articles.map(serializeArticleSummary),
        },
        200,
        {
          count: articles.length,
        },
      );
    } catch (error) {
      next(error);
    }
  },
);

educationRouter.get(
  '/articles/:idOrSlug',
  validateRequest({ params: articleIdentifierParamsSchema }),
  async (req, res, next) => {
    try {
      const article = await getArticleByIdentifier(req.params.idOrSlug);

      if (!article) {
        throw new AppError({
          statusCode: 404,
          code: 'ARTICLE_NOT_FOUND',
          message: 'Article not found.',
        });
      }

      sendSuccess(res, {
        article: serializeArticleDetail(article),
      });
    } catch (error) {
      next(error);
    }
  },
);

educationRouter.post(
  '/articles/:id/complete',
  requireAuth,
  validateRequest({ params: articleCompleteParamsSchema }),
  async (req, res, next) => {
    try {
      const article = await Article.findById(req.params.id);

      if (!article) {
        throw new AppError({
          statusCode: 404,
          code: 'ARTICLE_NOT_FOUND',
          message: 'Article not found.',
        });
      }

      const progress = await getOrCreateProgress(req.authUser._id);
      const alreadyCompleted = progress.completedArticleIds.some((articleId) =>
        articleId.equals(article._id),
      );

      if (!alreadyCompleted) {
        progress.completedArticleIds.push(article._id);
        progress.xp += 10;
        progress.level = computeLevel(progress.xp);
      }

      progress.lastActiveAt = new Date();
      await progress.save();

      sendSuccess(res, {
        completed: true,
        articleId: article._id.toString(),
        progress: serializeProgress({ progress, quizAccuracyPct: 0, recentAttempts: [] }),
      });
    } catch (error) {
      next(error);
    }
  },
);

educationRouter.get(
  '/quizzes',
  validateRequest({ query: quizListQuerySchema }),
  async (req, res, next) => {
    try {
      const { category, difficulty } = req.query;
      const filters = {};

      if (category) {
        filters.category = category;
      }

      if (difficulty) {
        filters.difficulty = difficulty;
      }

      const quizzes = await Quiz.find(filters).sort({ createdAt: -1 });
      const quizIds = quizzes.map((quiz) => quiz._id);
      const questionCounts = await Question.aggregate([
        { $match: { quizId: { $in: quizIds } } },
        { $group: { _id: '$quizId', count: { $sum: 1 } } },
      ]);

      const countsMap = new Map(questionCounts.map((item) => [item._id.toString(), item.count]));

      sendSuccess(
        res,
        {
          quizzes: quizzes.map((quiz) =>
            serializeQuizSummary(quiz, countsMap.get(quiz._id.toString()) ?? 0),
          ),
        },
        200,
        {
          count: quizzes.length,
        },
      );
    } catch (error) {
      next(error);
    }
  },
);

educationRouter.get(
  '/quizzes/:id',
  validateRequest({ params: quizIdParamsSchema }),
  async (req, res, next) => {
    try {
      const quiz = await Quiz.findById(req.params.id);

      if (!quiz) {
        throw new AppError({
          statusCode: 404,
          code: 'QUIZ_NOT_FOUND',
          message: 'Quiz not found.',
        });
      }

      const questions = await Question.find({ quizId: quiz._id }).sort({ order: 1, createdAt: 1 });

      sendSuccess(res, {
        quiz: {
          ...serializeQuizSummary(quiz, questions.length),
          questions: questions.map((question) => ({
            id: question._id.toString(),
            prompt: question.prompt,
            options: question.options,
            order: question.order,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

educationRouter.post(
  '/quizzes/:id/attempts',
  requireAuth,
  validateRequest({ params: quizIdParamsSchema, body: quizAttemptBodySchema }),
  async (req, res, next) => {
    try {
      const quiz = await Quiz.findById(req.params.id);

      if (!quiz) {
        throw new AppError({
          statusCode: 404,
          code: 'QUIZ_NOT_FOUND',
          message: 'Quiz not found.',
        });
      }

      const questions = await Question.find({ quizId: quiz._id }).sort({ order: 1, createdAt: 1 });

      if (!questions.length) {
        throw new AppError({
          statusCode: 400,
          code: 'QUIZ_EMPTY',
          message: 'Quiz has no questions yet.',
        });
      }

      const submittedAnswers = new Map(
        req.body.answers.map((answer) => [answer.questionId, answer.selectedOptionId]),
      );

      const feedback = questions.map((question) => {
        const selectedOptionId = submittedAnswers.get(question._id.toString()) ?? '';
        const isCorrect = selectedOptionId === question.correctOptionId;

        return {
          questionId: question._id.toString(),
          selectedOptionId,
          correctOptionId: question.correctOptionId,
          isCorrect,
          explanation: question.explanation,
        };
      });

      const correctCount = feedback.filter((item) => item.isCorrect).length;
      const score = Math.round((correctCount / questions.length) * 100);
      const passed = score >= quiz.passingScore;

      const attempt = await QuizAttempt.create({
        userId: req.authUser._id,
        quizId: quiz._id,
        score,
        passed,
        answers: feedback.map((item) => ({
          questionId: item.questionId,
          selectedOptionId: item.selectedOptionId,
          isCorrect: item.isCorrect,
        })),
        timeSpentSeconds: req.body.timeSpentSeconds ?? null,
      });

      const progress = await getOrCreateProgress(req.authUser._id);

      if (passed) {
        progress.xp += 20;
        progress.level = computeLevel(progress.xp);
      }

      progress.lastActiveAt = new Date();
      await progress.save();

      const recommendedNext = await getRecommendedNextQuiz(req.authUser._id, quiz);

      sendSuccess(res, {
        attemptId: attempt._id.toString(),
        score,
        passed,
        feedback,
        recommendedNext,
      });
    } catch (error) {
      next(error);
    }
  },
);

educationRouter.get('/progress', requireAuth, async (req, res, next) => {
  try {
    const progress = await getOrCreateProgress(req.authUser._id);
    const recentAttemptsDocs = await QuizAttempt.find({ userId: req.authUser._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('quizId');

    const totalAttempts = await QuizAttempt.countDocuments({ userId: req.authUser._id });
    const averageScoreRow = await QuizAttempt.aggregate([
      { $match: { userId: req.authUser._id } },
      { $group: { _id: null, avgScore: { $avg: '$score' } } },
    ]);

    const quizAccuracyPct = averageScoreRow.length ? Math.round(averageScoreRow[0].avgScore) : 0;
    const recentAttempts = recentAttemptsDocs.map((attempt) => ({
      id: attempt._id.toString(),
      quizId: attempt.quizId?._id?.toString?.() ?? null,
      quizTitle: attempt.quizId?.title ?? 'Unknown Quiz',
      category: attempt.quizId?.category ?? 'General',
      score: attempt.score,
      passed: attempt.passed,
      createdAt: attempt.createdAt.toISOString(),
    }));

    sendSuccess(
      res,
      {
        progress: serializeProgress({ progress, quizAccuracyPct, recentAttempts }),
      },
      200,
      {
        totalAttempts,
      },
    );
  } catch (error) {
    next(error);
  }
});

export { educationRouter };
