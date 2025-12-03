import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import logo from './logo.png'

function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Handle the password recovery token
    const handlePasswordRecovery = async () => {
      try {
        // Check if we have an auth session after Supabase redirect
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          setError('Invalid or expired reset link. Please request a new one.')
          setVerifying(false)
          return
        }

        if (!session) {
          setError('No valid session found. Please request a new password reset link.')
          setVerifying(false)
          return
        }

        // Session is valid, user can now reset password
        setVerifying(false)
      } catch (err) {
        console.error('Error:', err)
        setError('Something went wrong. Please try again.')
        setVerifying(false)
      }
    }

    handlePasswordRecovery()
  }, [])

  const handleReset = async (e) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      setSuccess(true)
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login')
      }, 2000)
      
    } catch (err) {
      setError('Failed to update password. Please try again.')
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6 flex-col">
        <div className="text-center mb-8">
          <div className="w-24 rounded avatar bg-base-100/10 p-2 mx-auto">
            <img src={logo} alt="Fried Chicken Stall logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-4xl font-extrabold text-[#f97316] mb-2 drop-shadow-lg">
            RESET YOUR PASSWORD
          </h1>
          <p className="text-lg tracking-wide text-white/90 drop-shadow-md">
            Securely update your account access
          </p>
        </div>

        <div className="card w-full max-w-md bg-base-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-primary/30">
          <div className="card-body items-center text-center gap-4">
            <span className="loading loading-spinner loading-lg text-primary" />
            <p className="text-base-content/80">Verifying your reset link...</p>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6 flex-col">
        <div className="text-center mb-8">
          <div className="w-24 rounded avatar bg-base-100/10 p-2 mx-auto">
            <img src={logo} alt="Fried Chicken Stall logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-4xl font-extrabold text-[#f97316] mb-2 drop-shadow-lg">
            RESET YOUR PASSWORD
          </h1>
          <p className="text-lg tracking-wide text-white/90 drop-shadow-md">
            Securely update your account access
          </p>
        </div>

        <div className="card w-full max-w-md bg-base-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-success/40">
          <div className="card-body items-center text-center gap-3">
            <div className="text-success text-4xl">✓</div>
            <h2 className="font-semibold text-lg text-success">
              Password updated successfully!
            </h2>
            <p className="text-base-content/70 text-sm">
              Redirecting you to the login page...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6 flex-col">
      <div className="text-center mb-8">
        <div className="w-24 rounded avatar bg-base-100/10 p-2 mx-auto">
          <img src={logo} alt="Fried Chicken Stall logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-4xl font-extrabold text-[#f97316] mb-2 drop-shadow-lg">
          RESET YOUR PASSWORD
        </h1>
        <p className="text-lg tracking-wide text-white/90 drop-shadow-md">
          Securely update your account access
        </p>
      </div>

      <div className="card w-full max-w-md bg-base-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-primary/30">
        <div className="card-body space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-primary mb-1">Create a new password</h2>
            <p className="text-base-content/70 text-sm">
              Choose a strong password you do not use elsewhere.
            </p>
          </div>

          {error && (
            <div className="alert alert-error shadow-sm">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleReset} className="space-y-4">
            <div className="form-control">
              <label className="label" htmlFor="new-password">
                <span className="label-text font-medium">New password</span>
              </label>
              <input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input input-bordered w-full bg-base-100"
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="confirm-password">
                <span className="label-text font-medium">Confirm password</span>
              </label>
              <input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="input input-bordered w-full bg-base-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`btn w-full border-0 bg-[#b91c1c] hover:bg-[#7f1d1d] text-white font-semibold ${
                loading ? 'loading' : ''
              }`}
            >
              {loading ? 'Updating password...' : 'Update password'}
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="btn btn-ghost btn-sm text-[#f97316] hover:text-[#fdba74]"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetPassword