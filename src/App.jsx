import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { NotificationProvider } from './contexts/NotificationContext'
import { ProfileProvider } from './contexts/ProfileContext'
import Login from './login'
import Dashboard from './dashboard'
import ManageStaff from './ManageStaff'
import ProtectedRoute from './components/ProtectedRoute'
import ManageInventory from './ManageStocks'
import PointOfSale from './components/PointOfSale'
import Reports from './Reports'
import AuditLog from './components/admin/AuditLog'
import Profile from './Profile'
import ToastContainer from './components/ToastContainer'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="loading loading-spinner loading-lg text-primary"></div>
      </div>
    )
  }

  return (
    <NotificationProvider>
      <ProfileProvider>
        <Router>
          <ToastContainer />
          <Routes>
          <Route 
            path="/login" 
            element={user ? <Navigate to="/dashboard" replace /> : <Login />} 
          />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/manage-staff" 
            element={
              <ProtectedRoute>
                <ManageStaff />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/manage-inventory"
            element={
              <ProtectedRoute>
                <ManageInventory />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/point-of-sale" 
            element={
              <ProtectedRoute>
                <PointOfSale />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/reports" 
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/audit-log" 
            element={
              <ProtectedRoute>
                <AuditLog />
              </ProtectedRoute>
            } 
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </ProfileProvider>
    </NotificationProvider>
  )
}

export default App
