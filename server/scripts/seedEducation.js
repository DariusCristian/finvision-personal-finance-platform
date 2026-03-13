import { connectToDatabase, disconnectFromDatabase } from '../src/database/mongoose.js';
import { Article, slugify } from '../src/models/article.js';
import { Question } from '../src/models/question.js';
import { Quiz } from '../src/models/quiz.js';
import { logger } from '../src/utils/logger.js';

const ARTICLES = [
  {
    title: '50/30/20 Budgeting Method Explained',
    category: 'Budgeting',
    difficulty: 'beginner',
    excerpt: 'A quick framework to allocate income toward needs, wants, and savings.',
    estimatedMinutes: 6,
    tags: ['budgeting', 'planning'],
    contentBlocks: [
      { type: 'paragraph', text: 'The 50/30/20 rule is a simple budgeting method that splits your take-home income into three buckets.' },
      { type: 'bulletList', items: ['50% Needs: rent, food, bills', '30% Wants: lifestyle expenses', '20% Savings and debt repayment'] },
      { type: 'callout', text: 'Start simple. Consistency matters more than perfect percentages in your first month.' },
    ],
  },
  {
    title: 'Emergency Fund: How Much Is Enough?',
    category: 'Basics',
    difficulty: 'beginner',
    excerpt: 'Learn how to size and build your emergency fund without over-saving cash.',
    estimatedMinutes: 5,
    tags: ['emergency-fund', 'cashflow'],
    contentBlocks: [
      { type: 'paragraph', text: 'An emergency fund protects you from unexpected expenses like medical bills or job loss.' },
      { type: 'bulletList', items: ['Starter goal: one month of expenses', 'Target goal: three to six months', 'Keep funds liquid and low-risk'] },
      { type: 'callout', text: 'Automate a weekly transfer so saving does not depend on motivation.' },
    ],
  },
  {
    title: 'Understanding Inflation and Purchasing Power',
    category: 'Basics',
    difficulty: 'intermediate',
    excerpt: 'Why prices rise over time and what it means for savings and investing.',
    estimatedMinutes: 7,
    tags: ['inflation', 'macro'],
    contentBlocks: [
      { type: 'paragraph', text: 'Inflation reduces how much your money can buy over time.' },
      { type: 'paragraph', text: 'If inflation outpaces your return, your real wealth declines even when balances rise nominally.' },
      { type: 'callout', text: 'Track returns after inflation to understand real performance.' },
    ],
  },
  {
    title: 'ETF Basics for Long-Term Investors',
    category: 'Investing',
    difficulty: 'beginner',
    excerpt: 'Exchange-traded funds provide broad diversification with low maintenance.',
    estimatedMinutes: 8,
    tags: ['etf', 'investing', 'diversification'],
    contentBlocks: [
      { type: 'paragraph', text: 'ETFs are baskets of assets traded on exchanges like stocks.' },
      { type: 'bulletList', items: ['Broad market exposure', 'Lower fees than many active funds', 'Easy recurring contributions'] },
      { type: 'callout', text: 'Choose a strategy and hold through volatility instead of reacting to headlines.' },
    ],
  },
  {
    title: 'Risk vs Return: Practical Tradeoffs',
    category: 'Investing',
    difficulty: 'intermediate',
    excerpt: 'How to align portfolio risk with your goals and time horizon.',
    estimatedMinutes: 7,
    tags: ['risk', 'portfolio'],
    contentBlocks: [
      { type: 'paragraph', text: 'Higher expected returns usually come with higher short-term volatility.' },
      { type: 'bulletList', items: ['Define your time horizon', 'Assess your loss tolerance', 'Diversify across asset classes'] },
      { type: 'callout', text: 'A strategy you can stick with is better than an optimal strategy you abandon.' },
    ],
  },
  {
    title: 'Crypto Position Sizing for Beginners',
    category: 'Crypto',
    difficulty: 'beginner',
    excerpt: 'How to set limits and avoid oversized exposure in volatile assets.',
    estimatedMinutes: 6,
    tags: ['crypto', 'risk-management'],
    contentBlocks: [
      { type: 'paragraph', text: 'Crypto can be highly volatile, so position sizing matters more than prediction.' },
      { type: 'bulletList', items: ['Use a fixed allocation rule', 'Avoid leverage as a beginner', 'Rebalance periodically'] },
      { type: 'callout', text: 'Treat speculative assets as a capped share of your total portfolio.' },
    ],
  },
  {
    title: 'Debt Snowball vs Avalanche Methods',
    category: 'Budgeting',
    difficulty: 'beginner',
    excerpt: 'Compare two common payoff strategies and choose the one you will sustain.',
    estimatedMinutes: 6,
    tags: ['debt', 'repayment'],
    contentBlocks: [
      { type: 'paragraph', text: 'Snowball prioritizes motivation by paying smallest balances first.' },
      { type: 'paragraph', text: 'Avalanche minimizes total interest by paying highest rates first.' },
      { type: 'callout', text: 'Pick the method that maximizes your consistency month after month.' },
    ],
  },
  {
    title: 'Creating a Monthly Cashflow Review Ritual',
    category: 'Budgeting',
    difficulty: 'intermediate',
    excerpt: 'A 20-minute monthly process to improve spending decisions.',
    estimatedMinutes: 5,
    tags: ['cashflow', 'habit'],
    contentBlocks: [
      { type: 'bulletList', items: ['Review top spending categories', 'Compare planned vs actual', 'Set one adjustment for next month'] },
      { type: 'paragraph', text: 'A lightweight routine helps you improve outcomes without overcomplicating your finances.' },
    ],
  },
];

const QUIZZES = [
  {
    title: 'Budgeting Fundamentals Quiz',
    category: 'Budgeting',
    difficulty: 'beginner',
    passingScore: 70,
    questions: [
      {
        order: 1,
        prompt: 'In the 50/30/20 method, what does the 20% bucket represent?',
        options: [
          { id: 'a', text: 'Housing costs only' },
          { id: 'b', text: 'Savings and debt repayment' },
          { id: 'c', text: 'Entertainment and travel' },
          { id: 'd', text: 'Taxes' },
        ],
        correctOptionId: 'b',
        explanation: 'The 20% category is typically allocated to savings and accelerated debt payments.',
      },
      {
        order: 2,
        prompt: 'Which expense is usually classified as a need?',
        options: [
          { id: 'a', text: 'Streaming subscription' },
          { id: 'b', text: 'Rent' },
          { id: 'c', text: 'Vacation flights' },
          { id: 'd', text: 'Premium gym upgrade' },
        ],
        correctOptionId: 'b',
        explanation: 'Rent is generally a fixed essential expense and belongs in the needs bucket.',
      },
      {
        order: 3,
        prompt: 'What is the main purpose of an emergency fund?',
        options: [
          { id: 'a', text: 'To invest in volatile assets quickly' },
          { id: 'b', text: 'To cover unexpected expenses without debt' },
          { id: 'c', text: 'To replace all insurance' },
          { id: 'd', text: 'To maximize monthly rewards points' },
        ],
        correctOptionId: 'b',
        explanation: 'Emergency funds reduce reliance on high-interest debt during shocks.',
      },
      {
        order: 4,
        prompt: 'What improves budgeting consistency most in early stages?',
        options: [
          { id: 'a', text: 'Complex spreadsheets' },
          { id: 'b', text: 'Perfect category precision' },
          { id: 'c', text: 'Simple repeatable habits' },
          { id: 'd', text: 'Checking balances once per quarter' },
        ],
        correctOptionId: 'c',
        explanation: 'Small repeatable habits outperform complex systems that are hard to maintain.',
      },
    ],
  },
  {
    title: 'Investing Basics Quiz',
    category: 'Investing',
    difficulty: 'beginner',
    passingScore: 70,
    questions: [
      {
        order: 1,
        prompt: 'What is a common advantage of broad-market ETFs?',
        options: [
          { id: 'a', text: 'Guaranteed profits' },
          { id: 'b', text: 'Broad diversification' },
          { id: 'c', text: 'No market risk' },
          { id: 'd', text: 'Daily tax exemption' },
        ],
        correctOptionId: 'b',
        explanation: 'Broad ETFs spread exposure across many holdings, reducing single-company risk.',
      },
      {
        order: 2,
        prompt: 'Risk and expected return are typically:',
        options: [
          { id: 'a', text: 'Unrelated' },
          { id: 'b', text: 'Inversely related' },
          { id: 'c', text: 'Positively related' },
          { id: 'd', text: 'Fixed by regulation' },
        ],
        correctOptionId: 'c',
        explanation: 'Assets with higher expected returns usually involve higher volatility or uncertainty.',
      },
      {
        order: 3,
        prompt: 'Which behavior supports long-term investing success?',
        options: [
          { id: 'a', text: 'Frequent panic selling' },
          { id: 'b', text: 'Strategy discipline through volatility' },
          { id: 'c', text: 'Concentrating in one stock only' },
          { id: 'd', text: 'Ignoring diversification completely' },
        ],
        correctOptionId: 'b',
        explanation: 'Discipline during volatile periods is critical for long-term compounding.',
      },
      {
        order: 4,
        prompt: 'A portfolio allocation should mainly depend on:',
        options: [
          { id: 'a', text: 'Social media trends' },
          { id: 'b', text: 'Time horizon and risk tolerance' },
          { id: 'c', text: 'Random selection' },
          { id: 'd', text: 'Single-day market moves' },
        ],
        correctOptionId: 'b',
        explanation: 'Time horizon and risk tolerance are foundational inputs for allocation decisions.',
      },
    ],
  },
  {
    title: 'Inflation and Cashflow Quiz',
    category: 'Basics',
    difficulty: 'intermediate',
    passingScore: 70,
    questions: [
      {
        order: 1,
        prompt: 'If inflation is higher than your return, your real purchasing power:',
        options: [
          { id: 'a', text: 'Increases' },
          { id: 'b', text: 'Stays flat' },
          { id: 'c', text: 'Declines' },
          { id: 'd', text: 'Doubles' },
        ],
        correctOptionId: 'c',
        explanation: 'Real returns account for inflation; a lower return than inflation means purchasing power loss.',
      },
      {
        order: 2,
        prompt: 'A monthly cashflow review should primarily help you:',
        options: [
          { id: 'a', text: 'Predict daily stock prices' },
          { id: 'b', text: 'Improve spending decisions over time' },
          { id: 'c', text: 'Eliminate all variable expenses' },
          { id: 'd', text: 'Stop tracking categories' },
        ],
        correctOptionId: 'b',
        explanation: 'The review loop is meant to improve decisions and adjust next-month behavior.',
      },
      {
        order: 3,
        prompt: 'Which metric is most useful for real performance tracking?',
        options: [
          { id: 'a', text: 'Nominal balance only' },
          { id: 'b', text: 'Return after inflation' },
          { id: 'c', text: 'Number of app logins' },
          { id: 'd', text: 'Spend count only' },
        ],
        correctOptionId: 'b',
        explanation: 'Real return better represents purchasing power outcomes.',
      },
      {
        order: 4,
        prompt: 'Best first step for someone with no emergency buffer is:',
        options: [
          { id: 'a', text: 'Max risk investing immediately' },
          { id: 'b', text: 'Build a starter emergency reserve' },
          { id: 'c', text: 'Ignore cash savings entirely' },
          { id: 'd', text: 'Take on high-interest debt' },
        ],
        correctOptionId: 'b',
        explanation: 'A starter emergency reserve improves resilience and reduces stress-driven decisions.',
      },
    ],
  },
  {
    title: 'Crypto Risk Management Quiz',
    category: 'Crypto',
    difficulty: 'beginner',
    passingScore: 70,
    questions: [
      {
        order: 1,
        prompt: 'As a beginner, what is a safer approach to crypto allocation?',
        options: [
          { id: 'a', text: 'Use all savings in one coin' },
          { id: 'b', text: 'Cap crypto as a small portfolio percentage' },
          { id: 'c', text: 'Trade with leverage by default' },
          { id: 'd', text: 'Borrow to increase exposure' },
        ],
        correctOptionId: 'b',
        explanation: 'Position sizing limits downside and keeps overall plan stable.',
      },
      {
        order: 2,
        prompt: 'Why is leverage risky for new investors?',
        options: [
          { id: 'a', text: 'It removes volatility' },
          { id: 'b', text: 'It amplifies losses' },
          { id: 'c', text: 'It guarantees positive returns' },
          { id: 'd', text: 'It lowers complexity' },
        ],
        correctOptionId: 'b',
        explanation: 'Leverage magnifies both gains and losses, often increasing liquidation risk.',
      },
      {
        order: 3,
        prompt: 'A practical risk habit for volatile assets is to:',
        options: [
          { id: 'a', text: 'Rebalance on a schedule' },
          { id: 'b', text: 'Never review allocation' },
          { id: 'c', text: 'Buy only based on hype' },
          { id: 'd', text: 'Ignore drawdowns completely' },
        ],
        correctOptionId: 'a',
        explanation: 'Scheduled rebalancing keeps allocations aligned with your target risk profile.',
      },
      {
        order: 4,
        prompt: 'The core goal of crypto position sizing is to:',
        options: [
          { id: 'a', text: 'Maximize short-term excitement' },
          { id: 'b', text: 'Control downside impact on total portfolio' },
          { id: 'c', text: 'Avoid all diversification' },
          { id: 'd', text: 'Trade every market move' },
        ],
        correctOptionId: 'b',
        explanation: 'Position sizing is primarily about risk control and portfolio survivability.',
      },
    ],
  },
];

const upsertArticle = async (article) => {
  const slug = slugify(article.slug ?? article.title);

  return Article.findOneAndUpdate(
    { slug },
    {
      ...article,
      slug,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );
};

const upsertQuizWithQuestions = async (quizDefinition) => {
  const quiz = await Quiz.findOneAndUpdate(
    { title: quizDefinition.title },
    {
      title: quizDefinition.title,
      category: quizDefinition.category,
      difficulty: quizDefinition.difficulty,
      passingScore: quizDefinition.passingScore,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  const orders = [];

  for (const questionDefinition of quizDefinition.questions) {
    orders.push(questionDefinition.order);

    await Question.findOneAndUpdate(
      {
        quizId: quiz._id,
        order: questionDefinition.order,
      },
      {
        quizId: quiz._id,
        ...questionDefinition,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  }

  await Question.deleteMany({
    quizId: quiz._id,
    order: {
      $nin: orders,
    },
  });

  return quiz;
};

const seedEducation = async () => {
  await connectToDatabase();

  try {
    await Promise.all(ARTICLES.map((article) => upsertArticle(article)));

    for (const quiz of QUIZZES) {
      // Sequential write keeps order handling deterministic.
      // eslint-disable-next-line no-await-in-loop
      await upsertQuizWithQuestions(quiz);
    }

    logger.info('education.seed.completed', {
      articles: ARTICLES.length,
      quizzes: QUIZZES.length,
    });
  } catch (error) {
    logger.error('education.seed.failed', {
      message: error?.message ?? 'Unknown seed error',
      stack: error?.stack,
    });
    process.exitCode = 1;
  } finally {
    await disconnectFromDatabase();
  }
};

void seedEducation();
