export const serializeUser = (user) => ({
  id: user._id.toString(),
  email: user.email,
  displayName: user.displayName,
  baseCurrency: user.baseCurrency,
  locale: user.locale ?? 'en-US',
  avatarUrl: user.avatarUrl ?? '',
  plan: 'free',
  monthlyBudgetGoal:
    typeof user.monthlyBudgetGoal === 'number' ? user.monthlyBudgetGoal : null,
  investingMonthlyContributionGoal:
    typeof user.investingMonthlyContributionGoal === 'number'
      ? user.investingMonthlyContributionGoal
      : 0,
  investingAccountBalance:
    typeof user.investingAccountBalance === 'number' ? user.investingAccountBalance : 0,
});
