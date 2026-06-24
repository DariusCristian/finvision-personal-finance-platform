import { Navigate, Route, Routes } from 'react-router-dom';

import { FinnyWidget } from './components/finny/FinnyWidget';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { BudgetPage } from './pages/BudgetPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinnyPage } from './pages/FinnyPage';
import { HomePage } from './pages/HomePage';
import { LearningArticlePage } from './pages/LearningArticlePage';
import { LearningCenterPage } from './pages/LearningCenterPage';
import { LearningQuizAttemptPage } from './pages/LearningQuizAttemptPage';
import { LearningQuizResultsPage } from './pages/LearningQuizResultsPage';
import { LoginPage } from './pages/LoginPage';
import { MarketPage } from './pages/MarketPage';
import { NewsPage } from './pages/NewsPage';
import { InvestDiscoveryPage } from './pages/InvestDiscoveryPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

export default function App() {
  const withRouteBoundary = (routeName: string, element: JSX.Element) => (
    <RouteErrorBoundary routeName={routeName}>{element}</RouteErrorBoundary>
  );

  return (
    <>
      <Routes>
        <Route path="/" element={withRouteBoundary('/', <HomePage />)} />
        <Route path="/login" element={withRouteBoundary('/login', <LoginPage />)} />
        <Route path="/register" element={withRouteBoundary('/register', <RegisterPage />)} />
        <Route
          path="/budget"
          element={withRouteBoundary(
            '/budget',
            <ProtectedRoute>
              <BudgetPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/home"
          element={withRouteBoundary(
            '/home',
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/dashboard" element={<Navigate to="/home" replace />} />
        <Route
          path="/transactions"
          element={withRouteBoundary(
            '/transactions',
            <ProtectedRoute>
              <TransactionsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/invest"
          element={withRouteBoundary(
            '/invest',
            <ProtectedRoute>
              <PortfolioPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/invest/discovery"
          element={withRouteBoundary(
            '/invest/discovery',
            <ProtectedRoute>
              <InvestDiscoveryPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/invest/market"
          element={withRouteBoundary(
            '/invest/market',
            <ProtectedRoute>
              <InvestDiscoveryPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/portfolio" element={<Navigate to="/invest" replace />} />
        <Route
          path="/market"
          element={withRouteBoundary(
            '/market',
            <ProtectedRoute>
              <MarketPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/news"
          element={withRouteBoundary(
            '/news',
            <ProtectedRoute>
              <NewsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/settings"
          element={withRouteBoundary(
            '/settings',
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/finny"
          element={withRouteBoundary(
            '/finny',
            <ProtectedRoute>
              <FinnyPage />
            </ProtectedRoute>
          )}
        />
        <Route path="/assistant" element={<Navigate to="/finny" replace />} />
        <Route
          path="/learn"
          element={withRouteBoundary(
            '/learn',
            <ProtectedRoute>
              <LearningCenterPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/learn/articles/:slugOrId"
          element={withRouteBoundary(
            '/learn/articles/:slugOrId',
            <ProtectedRoute>
              <LearningArticlePage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/learn/quizzes/:id"
          element={withRouteBoundary(
            '/learn/quizzes/:id',
            <ProtectedRoute>
              <LearningQuizAttemptPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/learn/quizzes/:id/results"
          element={withRouteBoundary(
            '/learn/quizzes/:id/results',
            <ProtectedRoute>
              <LearningQuizResultsPage />
            </ProtectedRoute>
          )}
        />
      </Routes>
      <FinnyWidget />
    </>
  );
}
