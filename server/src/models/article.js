import mongoose from 'mongoose';

const CONTENT_BLOCK_TYPES = ['paragraph', 'callout', 'bulletList'];
const ARTICLE_DIFFICULTY_VALUES = ['beginner', 'intermediate', 'advanced'];

const slugify = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const contentBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: CONTENT_BLOCK_TYPES,
      required: true,
    },
    text: {
      type: String,
      trim: true,
      default: null,
    },
    items: {
      type: [String],
      default: undefined,
    },
  },
  { _id: false },
);

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'Basics',
    },
    difficulty: {
      type: String,
      enum: ARTICLE_DIFFICULTY_VALUES,
      default: 'beginner',
      required: true,
    },
    excerpt: {
      type: String,
      trim: true,
      default: '',
    },
    contentBlocks: {
      type: [contentBlockSchema],
      required: true,
      default: [],
    },
    estimatedMinutes: {
      type: Number,
      default: 5,
      min: 1,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

articleSchema.pre('validate', function applyArticleSlug(next) {
  if (!this.slug && this.title) {
    this.slug = slugify(this.title);
  }

  if (this.slug) {
    this.slug = slugify(this.slug);
  }

  next();
});

const Article = mongoose.models.Article ?? mongoose.model('Article', articleSchema);

export { ARTICLE_DIFFICULTY_VALUES, Article, CONTENT_BLOCK_TYPES, slugify };
