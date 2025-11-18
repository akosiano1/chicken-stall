import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { logActivity, auditActions, auditEntities } from './utils/auditLog'
import { useNotifications } from './contexts/NotificationContext'
import logo from './logo.png'


function Login() {
    const navigate = useNavigate()
    const { showError, showSuccess } = useNotifications()
    const [formData, setFormData] = useState({email: '', password: ''})
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)

    // Handle email confirmation callback
    useEffect(() => {
        const handleEmailConfirmation = async () => {
            // Check both hash fragments and query parameters
            const hashParams = new URLSearchParams(window.location.hash.substring(1))
            const queryParams = new URLSearchParams(window.location.search)
            
            // Try hash first (newer format), then query params (older format)
            const accessToken = hashParams.get('access_token') || queryParams.get('access_token')
            const type = hashParams.get('type') || queryParams.get('type')
            const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token')

            if (accessToken && (type === 'signup' || type === 'email')) {
                try {
                    // Set the session with the access token
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken || '',
                    })

                    if (error) {
                        showError('Failed to confirm email: ' + error.message)
                        // Clean up URL
                        window.history.replaceState({}, document.title, '/login')
                        return
                    }

                    if (data.user) {
                        showSuccess('Email confirmed successfully! You can now log in.')
                        // Clean up URL
                        window.history.replaceState({}, document.title, '/login')
                        
                        // Optionally auto-login the user
                        const { data: profile, error: profileError } = await supabase
                            .from('profiles')
                            .select("*")
                            .eq('id', data.user.id)
                            .single()

                        if (!profileError && profile) {
                            localStorage.setItem('userProfile', JSON.stringify(profile))
                            navigate('/dashboard')
                        }
                    }
                } catch (err) {
                    console.error('Email confirmation error:', err)
                    showError('An error occurred during email confirmation.')
                    window.history.replaceState({}, document.title, '/login')
                }
            }
        }

        handleEmailConfirmation()
    }, [navigate, showError, showSuccess])

    const handleInputChange = (e) => {
        const {name, value} = e.target
        setFormData(prev => ({...prev, [name]: value}))
    }

    const handleSubmit = async (e) => { 
        e.preventDefault()
        setLoading(true)
        const {email,password} = formData
        const {data, error} = await supabase.auth.signInWithPassword({email,password})
        setLoading(false)
        
        if (!data.user?.email_confirmed_at) {
            showError('Please verify your email before logging in.')
            await supabase.auth.signOut();
            return;
        }

        
        if(error) {
            showError(error.message)
            console.error('Login error:', error.message)
        }
        else{
            const user = data.user

            const { data: profile, error: profileError} = await supabase
                .from('profiles')
                .select("*")
                .eq('id', user.id)
                .single()

            if(profileError){
                showError('Failed to load user profile.')
                console.error('Profile fetch error:', profileError.message)
                return
            }

            localStorage.setItem('userProfile', JSON.stringify(profile))
            showSuccess(`Welcome back, ${profile.full_name || 'User'}!`)
            
            // Log login activity
            await logActivity({
              action: auditActions.LOGIN,
              entity: auditEntities.USER,
              entityId: user.id,
              userId: user.id,
              userName: profile.full_name || user.email,
              details: `User logged in successfully`
            })
            
            navigate('/dashboard')
        }
        
    }


    return (
        <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6 flex-col">
            <div className="text-center mb-8">
                <div className="w-24 rounded avatar bg-base-100/10 p-2 mx-auto">
                    <img src={logo} alt="Fried Chicken Stall logo" className="w-full h-full object-contain" />
                </div>
                <h1 className="text-4xl font-extrabold text-[#f97316] mb-2 drop-shadow-lg">
                    SALES AND STOCK MONITOR SYSTEM
                </h1>
                <p className="text-lg tracking-wide text-white/90 drop-shadow-md">
                    Fried Chicken Stall Management
                </p>
            </div>

            <div className="card w-full max-w-md bg-base-100 shadow-[0_20px_60px_rgba(0,0,0,0.6)] mt-4 border border-primary/30">
                <div className="card-body text-base-content">
                    <div className="text-center mb-6">
                        <h1 className="text-3xl font-bold text-[#b91c1c]">Welcome Back</h1>
                        <p className="text-base-content/80 mt-2">
                            Access your stall management dashboard
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="form-control">
                            <label className="label" htmlFor="email">
                                <span className="label-text font-medium text-base-content">
                                    Email
                                </span>
                            </label>
                            <input
                                type="email" id="email" name="email"
                                placeholder="Enter your email" className="input input-bordered w-full"
                                value={formData.email} onChange={handleInputChange}
                                required
                            />
                        </div>

                        <div className="form-control">
                            <label className="label" htmlFor="password">
                                <span className="label-text font-medium text-base-content">
                                    Password
                                </span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    placeholder="Enter your password"
                                    className="input input-bordered w-full pr-12"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    required
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 btn btn-ghost btn-sm"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                                            />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                            />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="label cursor-pointer">
                                <input type="checkbox" className="checkbox checkbox-sm" />
                                <span className="label-text ml-2 text-base-content/90">
                                    Remember me
                                </span>
                            </label>
                            <a href="#" className="link text-[#f97316] text-sm hover:text-[#fdba74]">
                                Forgot password?
                            </a>
                        </div>

                        <div className="form-control mt-6">
                            <button
                                type="submit"
                                className={`btn w-full border-0 bg-[#b91c1c] hover:bg-[#7f1d1d] text-white font-semibold ${loading ? 'loading' : ''}`}
                                disabled={loading}
                            >
                                {loading ? 'Signing in...' : 'Sign In'}
                            </button>
                        </div>
                    </form>
                    <div className="divider"></div>
                </div>
            </div>
        </div>
    )
}

export default Login