import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useNotifications } from './contexts/NotificationContext'
import logo from './logo.png'

function ResetPassword() {
    const navigate = useNavigate()
    const { showError, showSuccess } = useNotifications()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [sessionReady, setSessionReady] = useState(false)

    useEffect(() => {
        const handleRecovery = async () => {
            const hashParams = new URLSearchParams(window.location.hash.substring(1))
            const queryParams = new URLSearchParams(window.location.search)
            const accessToken = hashParams.get('access_token') || queryParams.get('access_token')
            const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token')
            const type = hashParams.get('type') || queryParams.get('type')
            const code = hashParams.get('code') || queryParams.get('code')
            const tokenHash = hashParams.get('token_hash') || queryParams.get('token_hash')
            const isRecoveryFlow = !type || type === 'recovery'

            // Debug logging to understand reset URL shape in production
            console.log('[ResetPassword] location', {
                href: window.location.href,
                search: window.location.search,
                hash: window.location.hash,
            })
            console.log('[ResetPassword] params', {
                accessToken,
                refreshToken,
                type,
                code,
                tokenHash,
            })

            if (code && isRecoveryFlow) {
                const { error } = await supabase.auth.exchangeCodeForSession(code)
                if (error) {
                    showError('Reset link is invalid or has expired.')
                    navigate('/login', { replace: true })
                } else {
                    setSessionReady(true)
                }
                return
            }

            if (tokenHash && isRecoveryFlow) {
                const { error } = await supabase.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: 'recovery',
                })
                if (error) {
                    showError('Reset link is invalid or has expired.')
                    navigate('/login', { replace: true })
                } else {
                    setSessionReady(true)
                }
                return
            }

            if (accessToken && isRecoveryFlow) {
                const { error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken || '',
                })

                if (error) {
                    showError('Reset link is invalid or has expired.')
                    navigate('/login', { replace: true })
                } else {
                    setSessionReady(true)
                }
                return
            }

            showError('Reset link is missing required information.')
            navigate('/login', { replace: true })
        }

        handleRecovery()
    }, [navigate, showError])

    const handleUpdatePassword = async (e) => {
        e.preventDefault()
        if (password.length < 8) {
            showError('Password must be at least 8 characters long.')
            return
        }
        if (password !== confirmPassword) {
            showError('Passwords do not match.')
            return
        }

        try {
            setLoading(true)
            const { error } = await supabase.auth.updateUser({ password })
            if (error) {
                showError(error.message)
            } else {
                await supabase.auth.signOut()
                showSuccess('Password updated! You can now sign in.')
                setTimeout(() => navigate('/login', { replace: true }), 1200)
            }
        } catch (err) {
            console.error('Password update error:', err)
            showError('Failed to update password. Please try again.')
        } finally {
            setLoading(false)
        }
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
                <div className="card-body text-base-content space-y-4">
                    <h2 className="text-2xl font-bold text-primary text-center">Create a new password</h2>
                    {sessionReady ? (
                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                            <div className="form-control">
                                <label className="label" htmlFor="new-password">
                                    <span className="label-text font-medium">New password</span>
                                </label>
                                <input
                                    id="new-password"
                                    type="password"
                                    className="input input-bordered w-full"
                                    placeholder="Enter new password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-control">
                                <label className="label" htmlFor="confirm-password">
                                    <span className="label-text font-medium">Confirm password</span>
                                </label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    className="input input-bordered w-full"
                                    placeholder="Re-enter new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className={`btn w-full border-0 bg-[#b91c1c] hover:bg-[#7f1d1d] text-white font-semibold ${loading ? 'loading' : ''}`}
                                disabled={loading}
                            >
                                {loading ? 'Updating...' : 'Update password'}
                            </button>
                        </form>
                    ) : (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <span className="loading loading-spinner loading-lg text-primary"></span>
                            <p className="text-base-content/70 text-sm text-center">
                                Verifying your reset link...
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ResetPassword

