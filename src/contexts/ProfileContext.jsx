/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { fetchUserAuthStatus } from '../services/adminApi';
import { useAuth } from '../hooks/useAuth';

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch profile with stall information
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch profile
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, contact_number, role, status, stall_id, created_at')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      // Fetch stall information if stall_id exists
      let stall = null;
      if (data.stall_id) {
        try {
          const { data: stallData, error: stallError } = await supabase
            .from('stalls')
            .select('stall_id, stall_name, location')
            .eq('stall_id', data.stall_id)
            .single();
          
          if (!stallError && stallData) {
            stall = stallData;
          }
        } catch (stallErr) {
          // Silently fail - stall info is optional
          console.debug('Could not fetch stall info:', stallErr);
        }
      }

      // Fetch last sign in from auth (if admin access available)
      let lastSignInAt = null;
      try {
        const authInfo = await fetchUserAuthStatus(userId);
        if (authInfo?.lastSignInAt) {
          lastSignInAt = authInfo.lastSignInAt;
        }
      } catch (authError) {
        // Silently fail - last sign in is optional
        console.debug('Could not fetch last sign in:', authError);
      }

      const profileData = {
        ...data,
        last_sign_in_at: lastSignInAt,
        stall
      };

      setProfile(profileData);
      return profileData;
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err.message);
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh profile data
  const refreshProfile = useCallback(() => {
    if (user?.id) {
      return fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  // Load profile when user changes
  useEffect(() => {
    if (user?.id) {
      fetchProfile(user.id);
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [user?.id, fetchProfile]);

  // Update profile (for admin editing staff)
  const updateProfile = useCallback(async (userId, updates) => {
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select('id, full_name, email, contact_number, role, status, stall_id, created_at')
        .single();

      if (updateError) throw updateError;

      // Fetch stall information if stall_id exists
      let stall = null;
      if (data.stall_id) {
        try {
          const { data: stallData } = await supabase
            .from('stalls')
            .select('stall_id, stall_name, location')
            .eq('stall_id', data.stall_id)
            .single();
          
          if (stallData) {
            stall = stallData;
          }
        } catch (stallErr) {
          console.debug('Could not fetch stall info for updated profile:', stallErr);
        }
      }

      // If updating current user's profile, refresh it
      if (userId === user?.id) {
        setProfile({
          ...data,
          stall
        });
      }

      return { ...data, stall };
    } catch (err) {
      console.error('Error updating profile:', err);
      throw err;
    }
  }, [user?.id]);

  const value = {
    profile,
    loading,
    error,
    refreshProfile,
    updateProfile,
    fetchProfile
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
}

