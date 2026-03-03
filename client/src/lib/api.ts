const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  baseCurrency: 'RON' | 'EUR' | 'USD';
  monthlyBudgetGoal: number | null;
  investingMonthlyContributionGoal: number;
  investingAccountBalance: number;
};

export type BudgetCategory = {
  id: string;
  name: string;
  slug: string;
  color: string;
  kind: 'income' | 'expense' | 'both';
};

export type BudgetTransaction = {
  id: string;
  originalTransactionId: string;
  sourceDate: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  occurrenceDate: string;
  description: string;
  createdAt: string;
  isRecurring: boolean;
  recurrence: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
  recurrenceEndDate: string | null;
  nextOccurrenceAt: string | null;
  isProjected: boolean;
  category: BudgetCategory | null;
};

type ApiErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  requestId: string;
};

type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
};

type HealthResponse = ApiSuccessEnvelope<{
  status: string;
}>;

type AuthResponse = ApiSuccessEnvelope<{
  user: AuthUser;
  accessToken: string;
}>;

type CurrentUserResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type CategoriesResponse = ApiSuccessEnvelope<{
  categories: BudgetCategory[];
}>;

type TransactionsResponse = ApiSuccessEnvelope<{
  transactions: BudgetTransaction[];
}>;

type CreateTransactionResponse = ApiSuccessEnvelope<{
  transaction: BudgetTransaction;
}>;

type UpdateBudgetGoalResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type UpdateInvestingProfileResponse = ApiSuccessEnvelope<{
  user: AuthUser;
}>;

type RegisterPayload = {
  email: string;
  password: string;
  displayName: string;
  baseCurrency: 'RON' | 'EUR' | 'USD';
};

type LoginPayload = {
  email: string;
  password: string;
};

type TransactionsQuery = {
  from: string;
  to: string;
  search?: string;
  categoryId?: string;
  type?: 'income' | 'expense';
  sort?: 'date' | '-date' | 'amount' | '-amount';
};

type CreateTransactionPayload = {
  type: 'income' | 'expense';
  amount: number;
  categoryId: string;
  date: string;
  description?: string;
  isRecurring?: boolean;
  recurrence?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually' | 'none';
  recurrenceEndDate?: string | null;
};

export class ApiRequestError extends Error {
  code: string;
  details: unknown[];
  status: number;

  constructor(message: string, options?: { code?: string; details?: unknown[]; status?: number }) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = options?.code ?? 'API_REQUEST_ERROR';
    this.details = options?.details ?? [];
    this.status = options?.status ?? 500;
  }
}

const apiRequest = async <T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> => {
  const headers = new Headers(options.headers ?? {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const payload: unknown = await response.json();

  if (!response.ok) {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'success' in payload &&
      payload.success === false
    ) {
      const errorPayload = payload as ApiErrorEnvelope;

      throw new ApiRequestError(errorPayload.error.message, {
        code: errorPayload.error.code,
        details: errorPayload.error.details,
        status: response.status,
      });
    }

    throw new ApiRequestError('Request failed.', { status: response.status });
  }

  return payload as T;
};

export const checkApiHealth = async (): Promise<'ok' | 'unreachable'> => {
  try {
    const payload = await apiRequest<HealthResponse>('/healthz');
    return payload.success && payload.data.status === 'ok' ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
};

export const registerWithPassword = async (body: RegisterPayload) => {
  const payload = await apiRequest<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return payload.data;
};

export const loginWithPassword = async (body: LoginPayload) => {
  const payload = await apiRequest<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return payload.data;
};

export const fetchCurrentUser = async (token: string) => {
  const payload = await apiRequest<CurrentUserResponse>('/api/v1/auth/me', {}, token);
  return payload.data;
};

export const fetchCategories = async (token: string) => {
  const payload = await apiRequest<CategoriesResponse>('/api/v1/categories', {}, token);
  return payload.data;
};

export const fetchTransactions = async (query: TransactionsQuery, token: string) => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const payload = await apiRequest<TransactionsResponse>(
    `/api/v1/transactions?${params.toString()}`,
    {},
    token,
  );

  return payload.data;
};

export const createTransaction = async (body: CreateTransactionPayload, token: string) => {
  const payload = await apiRequest<CreateTransactionResponse>(
    '/api/v1/transactions',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const updateTransaction = async (
  transactionId: string,
  body: CreateTransactionPayload,
  token: string,
) => {
  const payload = await apiRequest<CreateTransactionResponse>(
    `/api/v1/transactions/${transactionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    token,
  );

  return payload.data;
};

export const deleteTransaction = async (transactionId: string, token: string) => {
  await apiRequest<ApiSuccessEnvelope<{ deleted: boolean; transactionId: string }>>(
    `/api/v1/transactions/${transactionId}`,
    {
      method: 'DELETE',
    },
    token,
  );
};

export const updateMonthlyBudgetGoal = async (monthlyBudgetGoal: number, token: string) => {
  const payload = await apiRequest<UpdateBudgetGoalResponse>(
    '/api/v1/profile/budget-goal',
    {
      method: 'PATCH',
      body: JSON.stringify({ monthlyBudgetGoal }),
    },
    token,
  );

  return payload.data;
};

export const updateInvestingProfile = async (
  investingMonthlyContributionGoal: number,
  token: string,
) => {
  const payload = await apiRequest<UpdateInvestingProfileResponse>(
    '/api/v1/profile/investing',
    {
      method: 'PATCH',
      body: JSON.stringify({ investingMonthlyContributionGoal }),
    },
    token,
  );

  return payload.data;
};
