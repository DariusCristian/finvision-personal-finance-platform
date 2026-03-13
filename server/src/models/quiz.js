import mongoose from 'mongoose';

const QUIZ_DIFFICULTY_VALUES = ['beginner', 'intermediate', 'advanced'];

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'Basics',
    },
    difficulty: {
      type: String,
      enum: QUIZ_DIFFICULTY_VALUES,
      default: 'beginner',
      required: true,
    },
    passingScore: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true },
);

const Quiz = mongoose.models.Quiz ?? mongoose.model('Quiz', quizSchema);

export { QUIZ_DIFFICULTY_VALUES, Quiz };
