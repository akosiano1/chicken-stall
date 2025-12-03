import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // adjust path as needed
import { useNavigate } from 'react-router-dom';

function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Handle the password recovery token
    const handlePasswordRecovery = async () => {
      try {
        // Check if we have an auth session after Supabase redirect
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Invalid or expired reset link. Please request a new one.');
          setVerifying(false);
          return;
        }

        if (!session) {
          setError('No valid session found. Please request a new password reset link.');
          setVerifying(false);
          return;
        }

        // Session is valid, user can now reset password
        setVerifying(false);
      } catch (err) {
        console.error('Error:', err);
        setError('Something went wrong. Please try again.');
        setVerifying(false);
      }
    };

    handlePasswordRecovery();
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
      
    } catch (err) {
      setError('Failed to update password. Please try again.');
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        backgroundColor: '#0a0e27'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#ff6b35', marginBottom: '1rem' }}>RESET YOUR PASSWORD</h2>
          <p style={{ color: '#fff' }}>Verifying your reset link...</p>
          <div style={{ marginTop: '1rem' }}>
            {/* Your loading spinner */}
            <div className="spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        backgroundColor: '#0a0e27'
      }}>
        <div style={{ textAlign: 'center', color: '#4ade80' }}>
          <h2>✓ Password Updated Successfully!</h2>
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: '#0a0e27',
      padding: '2rem'
    }}>
      <div style={{ 
        maxWidth: '400px', 
        width: '100%',
        backgroundColor: '#1a1f3a',
        padding: '2rem',
        borderRadius: '8px'
      }}>
        <h2 style={{ color: '#ff6b35', textAlign: 'center', marginBottom: '0.5rem' }}>
          RESET YOUR PASSWORD
        </h2>
        <p style={{ color: '#fff', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Securely update your account access
        </p>

        {error && (
          <div style={{ 
            backgroundColor: '#ff4444', 
            color: '#fff', 
            padding: '0.75rem', 
            borderRadius: '4px',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleReset}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem' }}>
              New Password
            </label>
            <input
              type="password"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #333',
                backgroundColor: '#0a0e27',
                color: '#fff'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ color: '#fff', display: 'block', marginBottom: '0.5rem' }}>
              Confirm Password
            </label>
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #333',
                backgroundColor: '#0a0e27',
                color: '#fff'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: loading ? '#666' : '#ff6b35',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'none',
              border: 'none',
              color: '#ff6b35',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;