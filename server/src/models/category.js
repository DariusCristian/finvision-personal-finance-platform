import mongoose from 'mongoose';

const SYSTEM_CATEGORIES = [
  { name: 'Food & Dining', type: 'expense', icon: 'utensils', color: '#3B82F6' },
  { name: 'Transport', type: 'expense', icon: 'car', color: '#FB923C' },
  { name: 'Housing', type: 'expense', icon: 'home', color: '#2563EB' },
  { name: 'Entertainment', type: 'expense', icon: 'sparkles', color: '#A855F7' },
  { name: 'Utilities', type: 'expense', icon: 'bolt', color: '#14B8A6' },
  { name: 'Health', type: 'expense', icon: 'heart-pulse', color: '#EF4444' },
  { name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: '#EC4899' },
  { name: 'Other', type: 'expense', icon: 'dots-horizontal', color: '#94A3B8' },
  { name: 'Salary', type: 'income', icon: 'briefcase', color: '#10B981' },
  { name: 'Freelance', type: 'income', icon: 'laptop', color: '#22C55E' },
  { name: 'Investing', type: 'expense', icon: 'line-chart', color: '#0EA5A4' },
];

const slugifyCategoryName = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const categorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    icon: {
      type: String,
      trim: true,
      default: null,
    },
    color: {
      type: String,
      trim: true,
      default: null,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    // Keep slug for stable client rendering and internal helpers.
    slug: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

categorySchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });

categorySchema.pre('validate', function deriveCategoryFields(next) {
  if (this.name) {
    this.name = this.name.trim();
    this.slug = slugifyCategoryName(this.name);
  }

  if (this.isSystem) {
    this.userId = null;
  }

  next();
});

const Category = mongoose.models.Category ?? mongoose.model('Category', categorySchema);

const resolveCategoryType = (category) => {
  if (category.type === 'income' || category.type === 'expense') {
    return category.type;
  }

  if (category.kind === 'income' || category.kind === 'expense') {
    return category.kind;
  }

  if ((category.slug ?? '').toLowerCase() === 'income') {
    return 'income';
  }

  return 'expense';
};

const serializeCategory = (category) => {
  const resolvedType = resolveCategoryType(category);

  return {
    id: category._id.toString(),
    userId: category.userId ? category.userId.toString() : null,
    name: category.name,
    slug: category.slug ?? slugifyCategoryName(category.name),
    type: resolvedType,
    kind: resolvedType,
    icon: category.icon ?? null,
    color: category.color ?? '#94A3B8',
    isSystem: Boolean(category.isSystem ?? !category.userId),
    createdAt: category.createdAt?.toISOString?.() ?? null,
    updatedAt: category.updatedAt?.toISOString?.() ?? null,
  };
};

const matchesSystemCategoryShape = (document, category) =>
  document.name === category.name && resolveCategoryType(document) === category.type;

const normalizeSystemCategory = async (category) => {
  const slug = slugifyCategoryName(category.name);
  const candidates = await Category.find({
    slug,
    $or: [{ userId: null }, { userId: { $exists: false } }],
  }).sort({ createdAt: 1, _id: 1 });

  const primaryDocument =
    candidates.find((document) => matchesSystemCategoryShape(document, category)) ??
    candidates[0] ??
    null;

  if (!primaryDocument) {
    await Category.create({
      userId: null,
      name: category.name,
      type: category.type,
      icon: category.icon ?? null,
      color: category.color ?? null,
      isSystem: true,
      slug,
    });
    return;
  }

  const duplicateIds = candidates
    .filter((document) => document._id.toString() !== primaryDocument._id.toString())
    .map((document) => document._id);

  if (duplicateIds.length > 0) {
    await Category.deleteMany({
      _id: {
        $in: duplicateIds,
      },
    });
  }

  await Category.updateOne(
    { _id: primaryDocument._id },
    {
      $set: {
        userId: null,
        name: category.name,
        type: category.type,
        icon: category.icon ?? null,
        color: category.color ?? null,
        isSystem: true,
        slug,
      },
    },
  );
};

const ensureSystemCategories = async () => {
  await Category.syncIndexes();

  for (const category of SYSTEM_CATEGORIES) {
    await normalizeSystemCategory(category);
  }
};

export { Category, SYSTEM_CATEGORIES, ensureSystemCategories, serializeCategory, slugifyCategoryName };
