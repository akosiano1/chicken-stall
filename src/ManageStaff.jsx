import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import {
  createStaffAccount,
  deleteStaffAccount,
  fetchUserAuthStatus,
  resendStaffInvite,
} from './services/adminApi';
import Layout from './components/Layout';
import { logActivity, auditActions, auditEntities } from './utils/auditLog';
import { useNotifications } from './contexts/NotificationContext';
import ConfirmModal from './components/ConfirmModal';
import { useProfile } from './contexts/ProfileContext';

function ManageStaff() {
  const navigate = useNavigate();
  const { showError, showSuccess } = useNotifications();
  const { profile: userProfile, loading: profileLoading } = useProfile();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, staffId: null });
  const [viewingStaff, setViewingStaff] = useState(null);
  const [editFormData, setEditFormData] = useState({ full_name: '', email: '', contact_number: '', status: 'active', stall_id: '' });
  const [updating, setUpdating] = useState(false);
  const staffModalRef = useRef(null);

  // Staff creation states
  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffContactNumber, setStaffContactNumber] = useState('');
  const [selectedStall, setSelectedStall] = useState('');
  const [stalls, setStalls] = useState([]);

  // Verify admin role and set loading
  useEffect(() => {
    if (!profileLoading) {
      if (userProfile) {
        if (userProfile.role !== 'admin') {
          showError('Access denied. Only admins can manage staff.');
          navigate('/dashboard');
          return;
        }
      }
      setLoading(false);
    }
  }, [userProfile, profileLoading, navigate, showError]);

  // 🧩 Fetch stalls and staff
  useEffect(() => {
    if (userProfile?.role === 'admin') {
      const fetchData = async () => {
        // Fetch stalls
        const { data: stallsData, error: stallsError } = await supabase
          .from('stalls')
          .select('stall_id, stall_name, location')
          .order('stall_name');

        if (!stallsError && stallsData) {
          setStalls(stallsData);
          if (stallsData.length > 0 && !selectedStall) {
            setSelectedStall(stallsData[0].stall_id);
          }
        }

        // Fetch staff profiles
        const { data: staffData, error: staffError } = await supabase
          .from('profiles')
          .select('id, full_name, email, contact_number, role, status, stall_id')
          .eq('role', 'staff')
          .order('full_name');

        if (!staffError && staffData) {
          const staffWithVerification = await fetchStaffWithVerification(staffData);
          setStaffList(staffWithVerification || []);
        }
      };
      fetchData();
    }
  }, [userProfile, selectedStall]);

  // Helper function to fetch staff with email verification status
  const fetchStaffWithVerification = async (staffData) => {
    return await Promise.all(
      staffData.map(async (staff) => {
        try {
          const authInfo = await fetchUserAuthStatus(staff.id);
          const isEmailConfirmed = !!authInfo?.emailConfirmedAt;

          if (isEmailConfirmed && staff.status === 'inactive') {
            await supabase
              .from('profiles')
              .update({ status: 'active' })
              .eq('id', staff.id);
            staff.status = 'active';
          }

          return {
            ...staff,
            displayStatus: isEmailConfirmed ? 'active' : 'unverified',
            last_sign_in_at: authInfo?.lastSignInAt || null
          };
        } catch (err) {
          console.error(`Error checking email for ${staff.id}:`, err);
          return {
            ...staff,
            displayStatus: staff.status
          };
        }
      })
    );
  };

  // 🧱 Create new staff
  const handleCreateStaff = async () => {
    if (!staffEmail || !staffPassword) {
      showError('Please fill in email and password.');
      return;
    }

    if (userProfile.role !== 'admin') {
      showError('Only admins can create staff accounts.');
      return;
    }

    setCreating(true);
    try {
      const { userId } = await createStaffAccount({
        email: staffEmail,
        password: staffPassword,
        fullName: staffName,
        contactNumber: staffContactNumber || null,
        stallId: selectedStall || null,
      });

      if (!userId) {
        throw new Error('Admin API did not return a userId for the new staff member.');
      }

      // Note: Confirmation email is automatically sent by the Edge Function
      // No need to call resendStaffInvite here

      const newProfile = {
        id: userId,
        full_name: staffName,
        email: staffEmail,
        contact_number: staffContactNumber || null,
        role: 'staff',
        status: 'inactive',
        stall_id: selectedStall || null,
      };

      // Log audit activity
      if (userProfile) {
        await logActivity({
          action: auditActions.CREATE,
          entity: auditEntities.STAFF,
          entityId: userId,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Created staff account: ${staffName} (${staffEmail})${selectedStall ? `, Assigned to stall: ${selectedStall}` : ''}`,
          newValue: newProfile
        });
      }

      showSuccess('Staff account created successfully!');
      
      // Reset form
      setStaffEmail('');
      setStaffName('');
      setStaffPassword('');
      setStaffContactNumber('');

      // Refresh staff list
      const { data: updatedStaff, error: fetchError } = await supabase
        .from('profiles')
        .select('id, full_name, email, contact_number, role, status, stall_id')
        .eq('role', 'staff')
        .order('full_name');

      if (!fetchError && updatedStaff) {
        const staffWithVerification = await fetchStaffWithVerification(updatedStaff);
        setStaffList(staffWithVerification || []);
      }

    } catch (error) {
      console.error('Error creating staff:', error);
      showError('Error creating staff account: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  // 👁️ View staff details (opens directly in edit mode)
  const handleViewStaff = (staff) => {
    setViewingStaff(staff);
    setEditFormData({
      full_name: staff.full_name || '',
      email: staff.email || '',
      contact_number: staff.contact_number || '',
      status: staff.status || 'active',
      stall_id: staff.stall_id || ''
    });
    if (staffModalRef.current) {
      staffModalRef.current.showModal();
    }
  };

  // ❌ Close modal
  const handleCloseModal = () => {
    if (staffModalRef.current) {
      staffModalRef.current.close();
    }
    setViewingStaff(null);
    setEditFormData({ full_name: '', email: '', contact_number: '', status: 'active', stall_id: '' });
  };

  // Handle modal show/hide based on viewingStaff state
  useEffect(() => {
    const modal = staffModalRef.current;
    if (modal) {
      if (viewingStaff) {
        modal.showModal();
      } else {
        modal.close();
      }
    }
  }, [viewingStaff]);

  const handleUpdateStaff = async () => {
    if (!viewingStaff) return;

    if (!editFormData.full_name) {
      showError('Please fill in full name.');
      return;
    }

    setUpdating(true);
    try {
      // Get old values for audit log
      const oldValue = {
        full_name: viewingStaff.full_name,
        email: viewingStaff.email,
        contact_number: viewingStaff.contact_number,
        status: viewingStaff.status,
        stall_id: viewingStaff.stall_id
      };

      const newValue = {
        full_name: editFormData.full_name,
        email: viewingStaff.email, // Email cannot be changed
        contact_number: editFormData.contact_number || null,
        status: editFormData.status,
        stall_id: editFormData.stall_id || null
      };

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: editFormData.full_name,
          contact_number: editFormData.contact_number || null,
          status: editFormData.status,
          stall_id: editFormData.stall_id || null
        })
        .eq('id', viewingStaff.id);

      if (updateError) throw updateError;

      // Note: Email cannot be edited by admins

      // Log audit activity
      if (userProfile) {
        await logActivity({
          action: auditActions.UPDATE,
          entity: auditEntities.STAFF,
          entityId: viewingStaff.id,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Updated staff account: ${oldValue.full_name} (${oldValue.email})`,
          oldValue,
          newValue
        });
      }

      showSuccess('Staff member updated successfully!');
      
      // Refresh staff list and update viewing staff
      const { data: updatedStaff, error: fetchError } = await supabase
        .from('profiles')
        .select('id, full_name, email, contact_number, role, status, stall_id')
        .eq('role', 'staff')
        .order('full_name');

      if (!fetchError && updatedStaff) {
        const staffWithVerification = await fetchStaffWithVerification(updatedStaff);
        setStaffList(staffWithVerification || []);
        
        // Update the viewing staff with new data
        const updated = staffWithVerification.find(s => s.id === viewingStaff.id);
        if (updated) {
          setViewingStaff(updated);
          setEditFormData({
            full_name: updated.full_name || '',
            email: updated.email || '',
            contact_number: updated.contact_number || '',
            status: updated.status || 'active',
            stall_id: updated.stall_id || ''
          });
        }
      }

    } catch (error) {
      console.error('Error updating staff:', error);
      showError('Error updating staff member: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // 🗑️ Delete staff from modal
  const handleDeleteFromModal = () => {
    if (viewingStaff) {
      handleCloseModal();
      handleDeleteStaff(viewingStaff.id);
    }
  };

  // 🗑️ Delete staff
  const handleDeleteStaff = (staffId) => {
    setConfirmDelete({ isOpen: true, staffId });
  };

  const confirmDeleteStaff = async () => {
    const staffId = confirmDelete.staffId;
    if (!staffId) return;

    try {
      // Get staff data before deleting for audit log
      const staffToDelete = staffList.find(staff => staff.id === staffId);
      const oldValue = staffToDelete ? {
        full_name: staffToDelete.full_name,
        email: staffToDelete.email,
        contact_number: staffToDelete.contact_number,
        role: staffToDelete.role,
        status: staffToDelete.status,
        stall_id: staffToDelete.stall_id
      } : null;

      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', staffId);

      if (profileError) throw profileError;

      try {
        await deleteStaffAccount(staffId);
      } catch (authError) {
        console.warn('Could not delete staff account from auth:', authError);
      }

      // Log audit activity
      if (userProfile && staffToDelete) {
        await logActivity({
          action: auditActions.DELETE,
          entity: auditEntities.STAFF,
          entityId: staffId,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Deleted staff account: ${staffToDelete.full_name} (${staffToDelete.email})`,
          oldValue
        });
      }

      showSuccess('Staff member deleted successfully!');
      setConfirmDelete({ isOpen: false, staffId: null });
      
      // Update staff list
      const { data: updatedStaff } = await supabase
        .from('profiles')
        .select('id, full_name, email, contact_number, role, status, stall_id')
        .eq('role', 'staff')
        .order('full_name');
      
      if (updatedStaff) {
        const staffWithVerification = await fetchStaffWithVerification(updatedStaff);
        setStaffList(staffWithVerification || []);
      }

    } catch (error) {
      console.error('Error deleting staff:', error);
      showError('Error deleting staff member: ' + error.message);
      setConfirmDelete({ isOpen: false, staffId: null });
    }
  };

  // Group staff by stall
  const staffByStall = {};
  stalls.forEach(stall => {
    staffByStall[stall.stall_id] = staffList.filter(staff => staff.stall_id === stall.stall_id);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="loading loading-spinner loading-lg text-primary"></div>
      </div>
    );
  }

  if (!userProfile) {
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
    <Layout userProfile={userProfile}>
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-primary mb-2">Manage Staff</h1>
          <p className="text-base-content/70">Create and manage staff accounts across all stalls</p>
        </div>

        {/* Create Staff Form */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title text-error mb-4">Create New Staff Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="form-control">
                <label className="label"><span className="label-text">Full Name</span></label>
                <input type="text" placeholder="Doe loe ritoe" className="input input-bordered w-full"
                  value={staffName} onChange={(e) => setStaffName(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Email</span></label>
                <input type="email" placeholder="staff@chickenstall.com" className="input input-bordered w-full"
                  value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Contact Number</span></label>
                <input
                  type="tel"
                  placeholder="09XX-XXX-XXXX"
                  className="input input-bordered w-full"
                  value={staffContactNumber}
                  onChange={(e) => setStaffContactNumber(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Password</span></label>
                <input type="password" placeholder="Secure password" className="input input-bordered w-full"
                  value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Stall</span></label>
                <select className="select select-bordered w-full"
                  value={selectedStall} onChange={(e) => setSelectedStall(e.target.value)}>
                  {stalls.map(stall => (
                    <option key={stall.stall_id} value={stall.stall_id}>
                      {stall.stall_name} - {stall.location}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="card-actions justify-end mt-4">
              <button className="btn btn-error" onClick={handleCreateStaff} disabled={creating}>
                {creating ? <span className="loading loading-spinner"></span> : null}
                {creating ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>

        {/* Stall Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {stalls.map(stall => (
            <div
              key={stall.stall_id}
              className="card bg-base-100 shadow-xl"
            >
              <div className="card-body">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="card-title text-primary">{stall.stall_name}</h2>
                  <div className="badge badge-secondary">
                    {staffByStall[stall.stall_id]?.length || 0} staff
                  </div>
                </div>
                <p className="text-sm text-base-content/70 mb-3">{stall.location}</p>

                <div className="space-y-2">
                  {staffByStall[stall.stall_id]?.length > 0 ? (
                    staffByStall[stall.stall_id].map(staff => (
                      <div 
                        key={staff.id} 
                        className="flex items-center justify-between p-3 bg-base-200 rounded-lg cursor-pointer hover:bg-base-300 transition-colors"
                        onClick={() => handleViewStaff(staff)}
                      >
                        <div className="flex-1">
                          <div className="font-medium">{staff.full_name}</div>
                          <div className="text-sm text-base-content/70">{staff.email}</div>
                          <div className={`badge badge-sm mt-1 ${
                            staff.displayStatus === 'active' 
                              ? 'badge-success' 
                              : staff.displayStatus === 'unverified'
                              ? 'badge-warning'
                              : 'badge-error'
                          }`}>
                            {staff.displayStatus}
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-base-content/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-base-content/50 py-4">
                      No staff assigned to this stall
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title="Delete Staff Member"
        message="Are you sure you want to delete this staff member? This action cannot be undone."
        onConfirm={confirmDeleteStaff}
        onCancel={() => setConfirmDelete({ isOpen: false, staffId: null })}
        confirmText="Delete"
        cancelText="Cancel"
        variant="error"
      />

      {/* Staff Edit Modal */}
      {viewingStaff && (
        <dialog ref={staffModalRef} className="modal">
          <div className="modal-box max-w-2xl">
            <form method="dialog">
              <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
            </form>
            
            {/* Edit Mode (opens directly when clicking staff card) */}
            <>
              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-base-300">
                <div className="avatar placeholder">
                  <div className="bg-primary text-primary-content rounded-full w-16">
                    <span className="text-2xl">
                      {viewingStaff.full_name?.charAt(0).toUpperCase() || viewingStaff.email?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{viewingStaff.full_name}</h3>
                  <div className="text-sm text-base-content/70">{viewingStaff.email}</div>
                  {viewingStaff.contact_number && (
                    <div className="text-sm text-base-content/70 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h2l3 7-1.5 2.5A16 16 0 0014.5 19L17 17l4 4-2 2a3 3 0 01-3 0c-4.97-2.485-9.485-7-12-12a3 3 0 010-3L3 5z" />
                      </svg>
                      {viewingStaff.contact_number}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <span className={`badge ${
                      viewingStaff.displayStatus === 'active' 
                        ? 'badge-success' 
                        : viewingStaff.displayStatus === 'unverified'
                        ? 'badge-warning'
                        : 'badge-error'
                    }`}>
                      {viewingStaff.displayStatus}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Full Name</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={editFormData.full_name}
                    onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Email</span>
                    <span className="label-text-alt text-warning">(Cannot be edited)</span>
                  </label>
                  <input
                    type="email"
                    className="input input-bordered w-full bg-base-200"
                    value={editFormData.email}
                    disabled
                    readOnly
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Contact Number</span>
                  </label>
                  <input
                    type="tel"
                    className="input input-bordered w-full"
                    placeholder="Optional"
                    value={editFormData.contact_number}
                    onChange={(e) => setEditFormData({ ...editFormData, contact_number: e.target.value })}
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Status</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Stall</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={editFormData.stall_id}
                    onChange={(e) => setEditFormData({ ...editFormData, stall_id: e.target.value })}
                  >
                    <option value="">No stall assigned</option>
                    {stalls.map(stall => (
                      <option key={stall.stall_id} value={stall.stall_id}>
                        {stall.stall_name} - {stall.location}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-action">
                <button
                  className="btn btn-ghost"
                  onClick={handleCloseModal}
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-error"
                  onClick={handleDeleteFromModal}
                  disabled={updating}
                >
                  Delete
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleUpdateStaff}
                  disabled={updating}
                >
                  {updating ? (
                    <>
                      <span className="loading loading-spinner"></span>
                      Updating...
                    </>
                  ) : (
                    'Update'
                  )}
                </button>
              </div>
            </>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={handleCloseModal}>close</button>
          </form>
        </dialog>
      )}
    </Layout>
  );
}

export default ManageStaff;