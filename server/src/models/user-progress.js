import mongoose from 'mongoose';

const userProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
    },
    streakDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    completedArticleIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Article',
      default: [],
    },
  },
  { timestamps: true },
);

const UserProgress =
  mongoose.models.UserProgress ?? mongoose.model('UserProgress', userProgressSchema);

export { UserProgress };
