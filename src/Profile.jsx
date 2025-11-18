import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from './contexts/ProfileContext';
import { getRoleDisplayName, getRoleBadgeColor, isStaff } from './utils/roleUtils';
import Layout from './components/Layout';
import { useNotifications } from './contexts/NotificationContext';

function Profile() {
  const navigate = useNavigate();
  const { profile, loading, error } = useProfile();
  const { showError } = useNotifications();

  useEffect(() => {
    // Only staff can view their profile (read-only)
    if (!loading && profile && !isStaff(profile)) {
      showError('Access denied. Only staff can view their profile.');
      navigate('/dashboard');
    }
  }, [profile, loading, navigate, showError]);

  if (loading) {
    return (
      <Layout userProfile={profile}>
        <div className="min-h-screen bg-base-200 flex items-center justify-center">
          <div className="loading loading-spinner loading-lg text-primary"></div>
        </div>
      </Layout>
    );
  }

  if (error || !profile) {
    return (
      <Layout userProfile={profile}>
        <div className="container mx-auto p-6">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body text-center">
              <h2 className="card-title text-error justify-center">Error Loading Profile</h2>
              <p>{error || 'Profile not found'}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // Format dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Manila'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return 'badge-success';
      case 'inactive':
        return 'badge-error';
      default:
        return 'badge-warning';
    }
  };

  return (
    <Layout userProfile={profile}>
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-primary mb-2">My Profile</h1>
          <p className="text-base-content/70">View your profile information</p>
        </div>

        {/* Profile Header Card */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="avatar placeholder">
                <div className="bg-primary text-primary-content rounded-full w-32">
                  <span className="text-5xl">
                    {profile.full_name?.charAt(0).toUpperCase() || profile.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-bold mb-2">{profile.full_name || 'No name set'}</h2>
                <p className="text-lg text-base-content/70 mb-1">{profile.email}</p>
                <div className="text-base-content/70 flex items-center gap-2 justify-center md:justify-start mb-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h2l3 7-1.5 2.5A16 16 0 0014.5 19L17 17l4 4-2 2a3 3 0 01-3 0c-4.97-2.485-9.485-7-12-12a3 3 0 010-3L3 5z" />
                  </svg>
                  {profile.contact_number || 'No contact number on file'}
                </div>
                <div className="flex gap-2 justify-center md:justify-start">
                  <span className={`badge badge-lg ${getRoleBadgeColor(profile.role)}`}>
                    {getRoleDisplayName(profile.role)}
                  </span>
                  <span className={`badge badge-lg ${getStatusBadge(profile.status)}`}>
                    {profile.status || 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="stat bg-base-100 shadow rounded-box">
            <div className="stat-figure text-primary">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="stat-title">Assigned Stall</div>
            <div className="stat-value text-lg">
              {profile.stall ? profile.stall.stall_name : 'None'}
            </div>
            {profile.stall?.location && (
              <div className="stat-desc">{profile.stall.location}</div>
            )}
          </div>

          <div className="stat bg-base-100 shadow rounded-box">
            <div className="stat-figure text-primary">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="stat-title">Account Created</div>
            <div className="stat-value text-lg">
              {profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
            </div>
            <div className="stat-desc">
              {profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric' }) : ''}
            </div>
          </div>

          <div className="stat bg-base-100 shadow rounded-box">
            <div className="stat-figure text-primary">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="stat-title">Last Login</div>
            <div className="stat-value text-lg">
              {profile.last_sign_in_at ? new Date(profile.last_sign_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'}
            </div>
            <div className="stat-desc">
              {profile.last_sign_in_at ? formatDate(profile.last_sign_in_at).split(',')[1]?.trim() : 'No login recorded'}
            </div>
          </div>
        </div>


        {/* Info Message */}
        <div className="alert alert-info mt-6">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Profile information is managed by administrators. Contact your administrator to update your profile details.</span>
        </div>
      </div>
    </Layout>
  );
}

export default Profile;

