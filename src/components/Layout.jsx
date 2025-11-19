import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getRoleDisplayName, getRoleBadgeColor } from '../utils/roleUtils';
import { logActivity, auditActions, auditEntities } from '../utils/auditLog';
import Sidebar from './Sidebar';
import { useNotifications } from '../contexts/NotificationContext';
import { useProfile } from '../contexts/ProfileContext';
import { useAuth } from '../hooks/useAuth';

function Layout({ children, userProfile: userProfileProp }) {
    const navigate = useNavigate();
    const { showError } = useNotifications();
    const { user } = useAuth();
    const { profile: profileFromContext } = useProfile();
    // Use profile from context if available, otherwise fall back to prop
    const userProfile = profileFromContext || userProfileProp;
    const [currentDate, setCurrentDate] = useState('');
    const [theme, setTheme] = useState('chicken-stall');

    // Update date in Philippine timezone
    useEffect(() => {
        const updateDate = () => {
            const now = new Date();
            const formattedDate = now.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'Asia/Manila'
            });
            setCurrentDate(formattedDate);
        };

        updateDate();
        // Update date every minute
        const dateInterval = setInterval(updateDate, 60000);

        return () => {
            clearInterval(dateInterval);
        };
    }, []);

    // Sync local theme state with current global theme once on mount
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(current === 'chicken-stall-dark' ? 'chicken-stall-dark' : 'chicken-stall');
    }, []);

    const toggleTheme = () => {
        const nextTheme = theme === 'chicken-stall-dark' ? 'chicken-stall' : 'chicken-stall-dark';
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', nextTheme);
            document.body?.setAttribute('data-theme', nextTheme);
        }
        setTheme(nextTheme);
        try {
            localStorage.setItem('theme', nextTheme);
        } catch {
            // ignore storage errors
        }
    };

    const handleLogout = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && userProfile) {
                await logActivity({
                    action: auditActions.LOGOUT,
                    entity: auditEntities.USER,
                    entityId: user.id,
                    userId: user.id,
                    userName: userProfile.full_name || user.email,
                    details: 'User logged out',
                });
            }
        } catch (activityError) {
            console.error('Error logging logout activity:', activityError);
        }

        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('Error logging out:', error.message);
            showError('Failed to log out.');
        } else {
            localStorage.removeItem('userProfile');
            navigate('/login');
        }
    };


    if (!user) {
        return (
            <div className="min-h-screen bg-base-200 flex items-center justify-center">
                <div className="card w-96 bg-base-100 shadow-xl">
                    <div className="card-body text-center">
                        <h2 className="card-title text-error justify-center">Access Denied</h2>
                        <p>You need to be logged in to access this page.</p>
                        <div className="card-actions justify-center mt-4">
                            <button onClick={() => navigate('/login')} className="btn btn-primary">Go to Login</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="drawer lg:drawer-open min-h-screen bg-base-200">
            <input id="my-drawer-2" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content flex flex-col">
                {/* Navbar */}
                <div className="navbar bg-base-100 shadow-lg">
                    <div className="flex-none lg:hidden">
                        <label htmlFor="my-drawer-2" className="btn btn-square btn-ghost drawer-button">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-6 h-6 stroke-current">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        </label>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between w-full">
                            <div>
                                <h1 className="text-xl font-bold text-primary">Sales and Stocks Monitoring System</h1>
                                {userProfile?.role && (
                                    <div className="flex items-center gap-2">
                                        <span className={`badge ${getRoleBadgeColor(userProfile.role)} badge-sm`}>
                                            {getRoleDisplayName(userProfile.role)}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                {currentDate && (
                                    <div className="hidden md:block text-sm text-base-content/70 mr-2">
                                        {currentDate}
                                    </div>
                                )}
                                {/* Theme toggle */}
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-circle"
                                    onClick={toggleTheme}
                                    aria-label="Toggle color theme"
                                >
                                    {theme === 'chicken-stall-dark' ? (
                                        // Sun icon for switching to light mode
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-6 h-6"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 3v2.25M18.364 5.636l-1.59 1.59M21 12h-2.25M18.364 18.364l-1.59-1.59M12 18.75V21M7.226 16.774l-1.59 1.59M5.25 12H3m3.636-6.364l-1.59 1.59M12 8.25A3.75 3.75 0 1015.75 12 3.75 3.75 0 0012 8.25z"
                                            />
                                        </svg>
                                    ) : (
                                        // Moon icon for switching to dark mode
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="w-6 h-6"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                                            />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="flex-none">
                        <div className="dropdown dropdown-end">
                            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar">
                                <div className="w-10 rounded-full bg-primary text-primary-content flex items-center justify-center">
                                    {userProfile?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                                </div>
                            </div>
                            <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
                                <li>
                                    <a onClick={() => {
                                        const modal = document.getElementById('profile-modal');
                                        if (modal) modal.showModal();
                                    }}>View Profile</a>
                                </li>
                                <li><a onClick={handleLogout}>Logout</a></li>
                            </ul>
                        </div>
                    </div>

                    {/* Profile Modal */}
                    <dialog id="profile-modal" className="modal">
                        <div className="modal-box max-w-md">
                            <form method="dialog">
                                <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                            </form>
                            {userProfile && (
                                <>
                                    <div className="flex flex-col items-center mb-6 pb-6 border-b border-base-300">
                                        <div className="avatar placeholder mb-4">
                                            <div className="bg-primary text-primary-content rounded-full w-20">
                                                <span className="text-4xl">
                                                    {userProfile.full_name?.charAt(0).toUpperCase() || userProfile.email?.charAt(0).toUpperCase() || 'U'}
                                                </span>
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold">{userProfile.full_name || 'No name set'}</h3>
                                        <p className="text-base-content/70 mt-1">{userProfile.email}</p>
                                        <div className="flex gap-2 mt-3">
                                            <span className={`badge ${getRoleBadgeColor(userProfile.role)}`}>
                                                {getRoleDisplayName(userProfile.role)}
                                            </span>
                                            <span className={`badge ${
                                                userProfile.status === 'active' ? 'badge-success' : 
                                                userProfile.status === 'inactive' ? 'badge-error' : 
                                                'badge-warning'
                                            }`}>
                                                {userProfile.status || 'Unknown'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-4 mb-6">
                                        {userProfile.stall && (
                                            <div className="flex items-center gap-3">
                                                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                                <div>
                                                    <div className="text-sm font-medium">{userProfile.stall.stall_name || 'Unknown Stall'}</div>
                                                    <div className="text-xs text-base-content/70">{userProfile.stall.location || 'No location'}</div>
                                                </div>
                                            </div>
                                        )}
                                        {userProfile.created_at && (
                                            <div className="flex items-center gap-3">
                                                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <div>
                                                    <div className="text-sm font-medium">Account Created</div>
                                                    <div className="text-xs text-base-content/70">
                                                        {new Date(userProfile.created_at).toLocaleDateString('en-US', {
                                                            year: 'numeric',
                                                            month: 'long',
                                                            day: 'numeric',
                                                            timeZone: 'Asia/Manila'
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="modal-action">
                                        <button 
                                            className="btn btn-primary w-full"
                                            onClick={() => {
                                                const modal = document.getElementById('profile-modal');
                                                if (modal) modal.close();
                                                navigate('/profile');
                                            }}
                                        >
                                            View Full Profile
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <form method="dialog" className="modal-backdrop">
                            <button>close</button>
                        </form>
                    </dialog>
                </div>

                {/* Main Content */}
                <div className="flex-grow">
                    {children}
                </div>
            </div>

            {/* Sidebar */}
            <Sidebar userProfile={userProfile} />
        </div>
    );
}

export default Layout;
