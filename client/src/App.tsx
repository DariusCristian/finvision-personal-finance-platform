import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { AssistantPage } from './pages/AssistantPage';
import { BudgetPage } from './pages/BudgetPage';
import { DashboardPage } from './pages/DashboardPage';
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
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/budget"
        element={
          <ProtectedRoute>
            <BudgetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <TransactionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invest"
        element={
          <ProtectedRoute>
            <PortfolioPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invest/discovery"
        element={
          <ProtectedRoute>
            <InvestDiscoveryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invest/market"
        element={
          <ProtectedRoute>
            <InvestDiscoveryPage />
          </ProtectedRoute>
        }
      />
      <Route path="/portfolio" element={<Navigate to="/invest" replace />} />
      <Route
        path="/market"
        element={
          <ProtectedRoute>
            <MarketPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/news"
        element={
          <ProtectedRoute>
            <NewsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assistant"
        element={
          <ProtectedRoute>
            <AssistantPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learn"
        element={
          <ProtectedRoute>
            <LearningCenterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learn/articles/:slugOrId"
        element={
          <ProtectedRoute>
            <LearningArticlePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learn/quizzes/:id"
        element={
          <ProtectedRoute>
            <LearningQuizAttemptPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learn/quizzes/:id/results"
        element={
          <ProtectedRoute>
            <LearningQuizResultsPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
