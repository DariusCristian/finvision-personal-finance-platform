import { Router } from 'express';

import { ConflictError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { Category, serializeCategory } from '../../models/category.js';
import { sendSuccess } from '../../utils/response.js';
import { createCategorySchema } from '../../validation/categories.js';

const categoryRouter = Router();

const findDuplicateCategory = async (userId, name, type) =>
  Category.findOne({
    userId,
    name,
    type,
  });

categoryRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const categories = await Category.find({
      $or: [{ isSystem: true }, { userId: req.authUser._id }],
    }).sort({ isSystem: -1, type: 1, name: 1 });

    const serializedCategories = categories.map(serializeCategory);

    sendSuccess(
      res,
      {
        categories: serializedCategories,
      },
      200,
      {
        count: serializedCategories.length,
        systemCount: serializedCategories.filter((category) => category.isSystem).length,
        userCount: serializedCategories.filter((category) => !category.isSystem).length,
      },
    );
  } catch (error) {
    next(error);
  }
});

categoryRouter.post(
  '/',
  requireAuth,
  validateRequest({ body: createCategorySchema }),
  async (req, res, next) => {
    try {
      const { name, type, icon, color } = req.body;
      const trimmedName = name.trim();

      const existingCategory = await findDuplicateCategory(req.authUser._id, trimmedName, type);

      if (existingCategory) {
        throw new ConflictError(
          'You already have a category with this name and type.',
          [],
          'CATEGORY_ALREADY_EXISTS',
        );
      }

      const category = await Category.create({
        userId: req.authUser._id,
        name: trimmedName,
        type,
        icon: icon ?? null,
        color: color ? (color.startsWith('#') ? color : `#${color}`) : null,
        isSystem: false,
      });

      sendSuccess(
        res,
        {
          category: serializeCategory(category),
        },
        201,
      );
    } catch (error) {
      if (error?.code === 11000) {
        next(
          new ConflictError(
            'You already have a category with this name and type.',
            [],
            'CATEGORY_ALREADY_EXISTS',
          ),
        );
        return;
      }

      next(error);
    }
  },
);

export { categoryRouter };
