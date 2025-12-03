import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Layout from './components/Layout';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList } from 'recharts';
import { buildTodayRangePH, restrictToStaffStallAndToday } from './utils/staffReportsToday';
import { logActivity, auditActions, auditEntities } from './utils/auditLog';
import { useNotifications } from './contexts/NotificationContext';
import DateRangeFilter from './components/common/DateRangeFilter';
import { applyDateRangeFilter } from './utils/dateFilterUtils';
import { useDebounce } from './hooks/useDebounce';
import { useProfile } from './contexts/ProfileContext';
import ConfirmModal from './components/ConfirmModal';

function Reports() {
  const navigate = useNavigate();
  const { showError } = useNotifications();
  const { profile: userProfile, loading: profileLoading } = useProfile();
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [salesByStall, setSalesByStall] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [stalls, setStalls] = useState([]);
  const [chartMetric, setChartMetric] = useState('sales');
  const [statistics, setStatistics] = useState({
    totalSales: 0,
    totalExpenses: 0,
    highestEarningStall: null,
    lowestEarningStall: null
  });
  const [stockHistory, setStockHistory] = useState([]);
  const [activityHistory, setActivityHistory] = useState([]);
  
  // Global filter (admin) - used only to broadcast into per-card filters
  const [globalDateRange, setGlobalDateRange] = useState({ startDate: '', endDate: '', stallId: '' });

  // Per-card filter states
  const [salesDateRange, setSalesDateRange] = useState({ startDate: '', endDate: '' });
  const [transactionsFilters, setTransactionsFilters] = useState({ startDate: '', endDate: '', stallId: '' });
  const [expensesFilters, setExpensesFilters] = useState({ startDate: '', endDate: '', stallId: '' });
  const [statisticsFilters, setStatisticsFilters] = useState({ startDate: '', endDate: '', stallId: '' });
  const [stockHistoryFilters, setStockHistoryFilters] = useState({ startDate: '', endDate: '', stallId: '' });
  const [activityHistoryFilters, setActivityHistoryFilters] = useState({ startDate: '', endDate: '', stallId: '' });

  // Debounced filter states for performance (300ms delay)
  const debouncedSalesDateRange = useDebounce(salesDateRange, 300);
  const debouncedTransactionsFilters = useDebounce(transactionsFilters, 300);
  const debouncedExpensesFilters = useDebounce(expensesFilters, 300);
  const debouncedStatisticsFilters = useDebounce(statisticsFilters, 300);
  const debouncedStockHistoryFilters = useDebounce(stockHistoryFilters, 300);
  const debouncedActivityHistoryFilters = useDebounce(activityHistoryFilters, 300);

  // Menu items (for editing transaction item / price)
  const [menuItems, setMenuItems] = useState([]);

  // Helper: apply a date (and optional stall) range to all cards (used by global filter)
  const applyGlobalRangeToCards = (range) => {
    // Sales overview uses only dates
    setSalesDateRange({
      startDate: range.startDate,
      endDate: range.endDate,
    });
    setTransactionsFilters((prev) => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate,
      ...(typeof range.stallId !== 'undefined' ? { stallId: range.stallId } : {}),
    }));
    setExpensesFilters((prev) => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate,
      ...(typeof range.stallId !== 'undefined' ? { stallId: range.stallId } : {}),
    }));
    setStatisticsFilters((prev) => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate,
      ...(typeof range.stallId !== 'undefined' ? { stallId: range.stallId } : {}),
    }));
    setStockHistoryFilters((prev) => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate,
      ...(typeof range.stallId !== 'undefined' ? { stallId: range.stallId } : {}),
    }));
    setActivityHistoryFilters((prev) => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate,
      ...(typeof range.stallId !== 'undefined' ? { stallId: range.stallId } : {}),
    }));
  };
  
  // Editing states (admin-only editing via modals)
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingStockHistory, setEditingStockHistory] = useState(null);
  const [editingActivityHistory, setEditingActivityHistory] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState({ isOpen: false, expenseId: null });
  
  // Error states
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Verify access and set loading
  useEffect(() => {
    if (!profileLoading) {
      if (userProfile) {
        // Both admin and staff can access reports
        if (userProfile.role !== 'staff' && userProfile.role !== 'admin') {
          showError('Access denied. Only staff and admin can view reports.');
          navigate('/dashboard');
          return;
        }
      }
      setLoading(false);
    }
  }, [userProfile, profileLoading, navigate, showError]);

  // Load stalls list
  useEffect(() => {
    const loadStalls = async () => {
      try {
        const { data, error } = await supabase
          .from('stalls')
          .select('stall_id, stall_name')
          .order('stall_name', { ascending: true });
        if (error) throw error;
        setStalls(data || []);
      } catch (err) {
        console.error('Error loading stalls:', err);
      }
    };

    const loadMenuItems = async () => {
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('item_id, item_name, price')
          .order('item_name', { ascending: true });
        if (error) throw error;
        setMenuItems(data || []);
      } catch (err) {
        console.error('Error loading menu items:', err);
      }
    };

    if (userProfile?.role === 'staff' || userProfile?.role === 'admin') {
      loadStalls();
      loadMenuItems();
    }
  }, [userProfile]);

  // Load sales overview by stall
  const loadSalesByStall = useCallback(async () => {
    try {
      let query = supabase
        .from('sales')
        .select(`
          stall_id,
          total_amount,
          sale_date,
          stalls(stall_name)
        `);

      // Apply date range filter for admin; staff will always be restricted to today
      if (userProfile?.role === 'admin') {
        query = applyDateRangeFilter(query, 'sale_date', debouncedSalesDateRange.startDate, debouncedSalesDateRange.endDate);
      }

      // Staff: always limit to their stall and today's date
      query = restrictToStaffStallAndToday(query, userProfile, { dateColumn: 'sale_date' });

      const { data, error } = await query.order('sale_date', { ascending: false });
  
      if (error) throw error;
  
      // Group by stall and calculate totals
      const stallSales = {};
      data?.forEach(sale => {
        const stallId = sale.stall_id;
        if (!stallSales[stallId]) {
          stallSales[stallId] = {
            stall_id: stallId,
            stall_name: sale.stalls?.stall_name || `Stall ${stallId}`,
            total_sales: 0,
            transaction_count: 0,
            last_sale: null
          };
        }
        stallSales[stallId].total_sales += Number(sale.total_amount || 0);
        stallSales[stallId].transaction_count += 1;
        if (
          !stallSales[stallId].last_sale ||
          new Date(sale.sale_date) > new Date(stallSales[stallId].last_sale)
        ) {
          stallSales[stallId].last_sale = sale.sale_date;
        }
      });
  
      setSalesByStall(Object.values(stallSales));
    } catch (err) {
      console.error('Error loading sales by stall:', err);
    }
  }, [userProfile, debouncedSalesDateRange]);
  

  // Load detailed transactions
  const loadTransactions = useCallback(async () => {
    try {
      let query = supabase
        .from('sales')
        .select(`
          sale_id,
          sale_date,
          quantity_sold,
          total_amount,
          payment_method,
          stall_id,
          product_id,
          stalls(stall_name),
          menu_items(item_name, price)
        `);

      // Apply filters (admin only; staff will be restricted to today via helper)
      if (userProfile?.role === 'admin') {
        query = applyDateRangeFilter(query, 'sale_date', debouncedTransactionsFilters.startDate, debouncedTransactionsFilters.endDate);
        if (debouncedTransactionsFilters.stallId) {
          query = query.eq('stall_id', debouncedTransactionsFilters.stallId);
        }
      }

      // Staff: always limit to their stall and today's date
      query = restrictToStaffStallAndToday(query, userProfile, { dateColumn: 'sale_date' });

      const { data, error } = await query.order('sale_date', { ascending: false }).limit(50);
  
      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Error loading transactions:', err);
    }
  }, [userProfile, debouncedTransactionsFilters]);
  


  // Load expenses
  const loadExpenses = useCallback(async () => {
    try {
      let query = supabase
        .from('expenses')
        .select('expense_id, expense_name, quantity, cost, date, supplier_name, stall_id, created_at, stalls(stall_name)');

      // Apply filters (admin only; staff will be restricted to today via helper)
      if (userProfile?.role === 'admin') {
        query = applyDateRangeFilter(query, 'date', debouncedExpensesFilters.startDate, debouncedExpensesFilters.endDate);
        if (debouncedExpensesFilters.stallId) {
          if (debouncedExpensesFilters.stallId === '__none__') {
            query = query.is('stall_id', null);
          } else {
            query = query.eq('stall_id', debouncedExpensesFilters.stallId);
          }
        }
      }

      // Staff: always limit to their stall and today's date
      query = restrictToStaffStallAndToday(query, userProfile, { dateColumn: 'date' });

      const { data, error } = await query.order('date', { ascending: false }).limit(50);

      if (error) throw error;
      setExpenses(data || []);
    } catch (err) {
      console.error('Error loading expenses:', err);
    }
  }, [userProfile, debouncedExpensesFilters]);

  // Load statistics
  const loadStatistics = useCallback(async () => {
    try {
      let statsStartDate = null;
      let statsEndDate = null;
      let statsStallId = statisticsFilters.stallId || null;

      if (userProfile?.role === 'staff') {
        // Staff: always today + their stall
        const { startDate, endDate } = buildTodayRangePH();
        statsStartDate = startDate;
        statsEndDate = endDate;
        statsStallId = userProfile.stall_id || null;
      } else if (userProfile?.role === 'admin') {
        statsStartDate = debouncedStatisticsFilters.startDate || null;
        statsEndDate = debouncedStatisticsFilters.endDate || null;
        statsStallId = debouncedStatisticsFilters.stallId || null;
      }

      // Get total sales with filters
      let salesQuery = supabase.from('sales').select('total_amount');
      if (statsStartDate) {
        salesQuery = salesQuery.gte('sale_date', statsStartDate);
      }
      if (statsEndDate) {
        salesQuery = salesQuery.lte('sale_date', statsEndDate);
      }
      if (statsStallId) {
        salesQuery = salesQuery.eq('stall_id', statsStallId);
      }
      const { data: salesData, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      // Get total expenses with filters
      let expensesQuery = supabase.from('expenses').select('cost');
      if (statsStartDate) {
        expensesQuery = expensesQuery.gte('date', statsStartDate);
      }
      if (statsEndDate) {
        expensesQuery = expensesQuery.lte('date', statsEndDate);
      }
      if (statsStallId) {
        expensesQuery = expensesQuery.eq('stall_id', statsStallId);
      }
      const { data: expensesData, error: expensesError } = await expensesQuery;
      if (expensesError) throw expensesError;

      const totalSales = salesData?.reduce((sum, sale) => sum + sale.total_amount, 0) || 0;
      const totalExpenses = expensesData?.reduce((sum, expense) => sum + expense.cost, 0) || 0;

      // Get stall performance for highest/lowest
      let stallQuery = supabase
        .from('sales')
        .select(`
          stall_id,
          total_amount,
          stalls(stall_name)
        `);
      if (statsStartDate) {
        stallQuery = stallQuery.gte('sale_date', statsStartDate);
      }
      if (statsEndDate) {
        stallQuery = stallQuery.lte('sale_date', statsEndDate);
      }
      if (statsStallId) {
        stallQuery = stallQuery.eq('stall_id', statsStallId);
      }
      const { data: stallData, error: stallError } = await stallQuery;
      if (stallError) throw stallError;

      // Calculate stall totals
      const stallTotals = {};
      stallData?.forEach(sale => {
        const stallId = sale.stall_id;
        if (!stallTotals[stallId]) {
          stallTotals[stallId] = {
            stall_id: stallId,
            stall_name: sale.stalls?.stall_name || `Stall ${stallId}`,
            total: 0
          };
        }
        stallTotals[stallId].total += sale.total_amount;
      });

      const stallArray = Object.values(stallTotals);
      const highestEarningStall = stallArray.length > 0 ? stallArray.reduce((max, stall) => 
        stall.total > max.total ? stall : max, stallArray[0]) : null;
      const lowestEarningStall = stallArray.length > 0 ? stallArray.reduce((min, stall) => 
        stall.total < min.total ? stall : min, stallArray[0]) : null;

      setStatistics({
        totalSales,
        totalExpenses,
        highestEarningStall,
        lowestEarningStall
      });
    } catch (err) {
      console.error('Error loading statistics:', err);
    }
  }, [userProfile, debouncedStatisticsFilters, statisticsFilters]);

  // Load stock history (admin only)
  const loadStockHistory = useCallback(async () => {
    if (userProfile?.role !== 'admin') {
      setStockHistory([]);
      return;
    }

    try {
      let query = supabase
        .from('stock_status_history')
        .select(`
          id,
          stall_id,
          stock_level,
          stock_status,
          date,
          created_at,
          stalls(stall_name)
        `);

      query = applyDateRangeFilter(query, 'date', debouncedStockHistoryFilters.startDate, debouncedStockHistoryFilters.endDate);
      if (debouncedStockHistoryFilters.stallId) {
        query = query.eq('stall_id', debouncedStockHistoryFilters.stallId);
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('stall_id', { ascending: true })
        .limit(150);

      if (error) throw error;
      setStockHistory(data || []);
    } catch (err) {
      console.error('Error loading stock history:', err);
    }
  }, [userProfile, debouncedStockHistoryFilters]);

  // Load activity history (admin only)
  const loadActivityHistory = useCallback(async () => {
    if (userProfile?.role !== 'admin') {
      setActivityHistory([]);
      return;
    }

    try {
      let query = supabase
        .from('stall_status_history')
        .select(`
          id,
          stall_id,
          status,
          date,
          changed_at,
          stalls(stall_name)
        `);

      query = applyDateRangeFilter(query, 'date', debouncedActivityHistoryFilters.startDate, debouncedActivityHistoryFilters.endDate);
      if (debouncedActivityHistoryFilters.stallId) {
        query = query.eq('stall_id', debouncedActivityHistoryFilters.stallId);
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('changed_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Reduce to one row per (stall_id, date) with latest changed_at
      const latestByStallAndDate = {};
      data?.forEach((row) => {
        const key = `${row.stall_id}-${row.date}`;
        if (!latestByStallAndDate[key]) {
          latestByStallAndDate[key] = row;
        }
      });

      setActivityHistory(Object.values(latestByStallAndDate));
    } catch (err) {
      console.error('Error loading activity history:', err);
    }
  }, [userProfile, debouncedActivityHistoryFilters]);
  // Load all reports data (using debounced filters for performance)
  useEffect(() => {
    if (userProfile?.role !== 'staff' && userProfile?.role !== 'admin') {
      return;
    }

    const loadReportsData = async () => {
      try {
        await Promise.all([
          loadSalesByStall(),
          loadTransactions(),
          loadExpenses(),
          loadStatistics(),
          loadStockHistory(),
          loadActivityHistory(),
        ]);
      } catch (err) {
        setError('Failed to load reports data: ' + err.message);
      }
    };

    loadReportsData();
  }, [
    userProfile,
    debouncedSalesDateRange,
    debouncedTransactionsFilters,
    debouncedExpensesFilters,
    debouncedStatisticsFilters,
    debouncedStockHistoryFilters,
    debouncedActivityHistoryFilters,
    loadSalesByStall,
    loadTransactions,
    loadExpenses,
    loadStatistics,
    loadStockHistory,
    loadActivityHistory,
  ]);

  // Edit transaction (sales record)
  const handleEditTransaction = async (transaction, updatedData) => {
    setEditLoading(true);
    setError('');
    setSuccess('');
    try {
      // Capture old values for audit log
      const oldValue = {
        sale_date: transaction.sale_date,
        quantity_sold: transaction.quantity_sold,
        total_amount: transaction.total_amount,
        payment_method: transaction.payment_method,
        stall_id: transaction.stall_id,
        product_id: transaction.product_id
      };
      
      const newValue = {
        sale_date: updatedData.sale_date,
        quantity_sold: updatedData.quantity_sold,
        total_amount: updatedData.total_amount,
        payment_method: updatedData.payment_method,
        stall_id: updatedData.stall_id,
        product_id: updatedData.product_id
      };

      const { error } = await supabase
        .from('sales')
        .update({
          sale_date: updatedData.sale_date,
          quantity_sold: updatedData.quantity_sold,
          total_amount: updatedData.total_amount,
          payment_method: updatedData.payment_method,
          stall_id: updatedData.stall_id,
          product_id: updatedData.product_id
        })
        .eq('sale_id', transaction.sale_id);
      
      if (error) throw error;

      // Log audit activity
      if (userProfile) {
        await logActivity({
          action: auditActions.UPDATE,
          entity: auditEntities.SALE,
          entityId: transaction.sale_id,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Updated transaction: Sale ID ${transaction.sale_id}, Amount: ₱${oldValue.total_amount.toFixed(2)} → ₱${updatedData.total_amount.toFixed(2)}`,
          oldValue,
          newValue,
          stallId: updatedData.stall_id || transaction.stall_id
        });
      }

      setSuccess('Transaction updated successfully.');
      setEditingTransaction(null);
      loadTransactions();
      loadSalesByStall();
      loadStatistics();
    } catch (err) {
      setError('Failed to update transaction: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Edit expense
  const handleEditExpense = async (expense, updatedData) => {
    setEditLoading(true);
    setError('');
    setSuccess('');
    try {
      // Capture old values for audit log
      const oldValue = {
        expense_name: expense.expense_name,
        quantity: expense.quantity,
        cost: expense.cost,
        date: expense.date,
        supplier_name: expense.supplier_name,
        stall_id: expense.stall_id
      };
      
      const newValue = {
        expense_name: updatedData.expense_name,
        quantity: updatedData.quantity,
        cost: updatedData.cost,
        date: updatedData.date,
        supplier_name: updatedData.supplier_name,
        stall_id: updatedData.stall_id
      };

      const { error } = await supabase
        .from('expenses')
        .update({
          expense_name: updatedData.expense_name,
          quantity: updatedData.quantity,
          cost: updatedData.cost,
          date: updatedData.date,
          supplier_name: updatedData.supplier_name,
          stall_id: updatedData.stall_id
        })
        .eq('expense_id', expense.expense_id);
      
      if (error) throw error;

      // Log audit activity
      if (userProfile) {
        await logActivity({
          action: auditActions.UPDATE_EXPENSE,
          entity: auditEntities.EXPENSE,
          entityId: expense.expense_id,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Updated expense: ${oldValue.expense_name}, Cost: ₱${oldValue.cost.toFixed(2)} → ₱${updatedData.cost.toFixed(2)}`,
          oldValue,
          newValue,
          stallId: updatedData.stall_id || expense.stall_id
        });
      }

      setSuccess('Expense updated successfully.');
      setEditingExpense(null);
      loadExpenses();
      loadStatistics();
    } catch (err) {
      setError('Failed to update expense: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Delete expense
  const handleDeleteExpense = (expenseId) => {
    setConfirmDeleteExpense({ isOpen: true, expenseId });
  };

  const handleConfirmDeleteExpense = async () => {
    const expenseId = confirmDeleteExpense.expenseId;
    if (!expenseId) return;

    setEditLoading(true);
    setError('');
    setSuccess('');
    try {
      // Get expense data before deleting for audit log
      const expenseToDelete = expenses.find(exp => exp.expense_id === expenseId);
      const oldValue = expenseToDelete ? {
        expense_name: expenseToDelete.expense_name,
        quantity: expenseToDelete.quantity,
        cost: expenseToDelete.cost,
        date: expenseToDelete.date,
        supplier_name: expenseToDelete.supplier_name,
        stall_id: expenseToDelete.stall_id
      } : null;

      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('expense_id', expenseId);

      if (error) throw error;

      // Log audit activity
      if (userProfile && expenseToDelete) {
        await logActivity({
          action: auditActions.DELETE_EXPENSE,
          entity: auditEntities.EXPENSE,
          entityId: expenseId,
          userId: userProfile.id,
          userName: userProfile.full_name,
          details: `Deleted expense: ${expenseToDelete.expense_name}, Cost: ₱${expenseToDelete.cost.toFixed(2)}`,
          oldValue,
          stallId: expenseToDelete.stall_id
        });
      }

      setSuccess('Expense deleted successfully.');
      setConfirmDeleteExpense({ isOpen: false, expenseId: null });
      setEditingExpense(null);
      loadExpenses();
      loadStatistics();
    } catch (err) {
      setError('Failed to delete expense: ' + err.message);
      setConfirmDeleteExpense({ isOpen: false, expenseId: null });
    } finally {
      setEditLoading(false);
    }
  };

  // Edit stock history (stock_status_history)
  const handleEditStockHistory = async () => {
    if (!editingStockHistory) return;

    setEditLoading(true);
    setError('');
    setSuccess('');

    try {
      // Combine separate date and time fields into a single timestamp for created_at
      let createdAt = editingStockHistory.created_at;
      if (editingStockHistory.date && editingStockHistory.time) {
        const isoString = `${editingStockHistory.date}T${editingStockHistory.time}:00`;
        createdAt = new Date(isoString).toISOString();
      }

      const { error } = await supabase
        .from('stock_status_history')
        .update({
          date: editingStockHistory.date,
          stock_level: editingStockHistory.stock_level,
          stock_status: editingStockHistory.stock_status,
          stall_id: editingStockHistory.stall_id,
          created_at: createdAt,
        })
        .eq('id', editingStockHistory.id);

      if (error) throw error;

      setSuccess('Stock history record updated successfully.');
      setEditingStockHistory(null);
      loadStockHistory();
    } catch (err) {
      setError('Failed to update stock history record: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Edit activity history (stall_status_history)
  const handleEditActivityHistory = async () => {
    if (!editingActivityHistory) return;

    setEditLoading(true);
    setError('');
    setSuccess('');

    try {
      let changedAt = editingActivityHistory.changed_at;
      if (editingActivityHistory.date && editingActivityHistory.time) {
        const isoString = `${editingActivityHistory.date}T${editingActivityHistory.time}:00`;
        changedAt = new Date(isoString).toISOString();
      }

      const { error } = await supabase
        .from('stall_status_history')
        .update({
          date: editingActivityHistory.date,
          status: editingActivityHistory.status,
          stall_id: editingActivityHistory.stall_id,
          changed_at: changedAt,
        })
        .eq('id', editingActivityHistory.id);

      if (error) throw error;

      setSuccess('Activity history record updated successfully.');
      setEditingActivityHistory(null);
      loadActivityHistory();
    } catch (err) {
      setError('Failed to update activity history record: ' + err.message);
    } finally {
      setEditLoading(false);
    }
  };

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
          <h1 className="text-3xl font-bold text-primary mb-2">History Reports</h1>
          <p className="text-base-content/70">Comprehensive overview of sales, expenses, and historical performance metrics</p>
        </div>

        {/* Global date and stall filter - admin only */}
        {userProfile?.role === 'admin' && (
          <div className="card bg-base-100 shadow-md mb-6">
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Half - Date Filtering */}
                <div className="space-y-4">
                  <DateRangeFilter
                    startDate={globalDateRange.startDate}
                    endDate={globalDateRange.endDate}
                    onChange={(newStartDate, newEndDate) => {
                      const next = {
                        ...globalDateRange,
                        startDate: newStartDate,
                        endDate: newEndDate,
                      };
                      setGlobalDateRange(next);
                      applyGlobalRangeToCards(next);
                    }}
                    options={{
                      allowFuture: false,
                      showPresets: true,
                      size: 'sm',
                      maxWidth: 'max-w-xs',
                    }}
                  />
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-xs">Stall</span>
                    </label>
                    <select
                      className="select select-bordered select-sm w-full max-w-xs"
                      value={globalDateRange.stallId}
                      onChange={(e) => {
                        const next = {
                          ...globalDateRange,
                          stallId: e.target.value,
                        };
                        setGlobalDateRange(next);
                        applyGlobalRangeToCards(next);
                      }}
                    >
                      <option value="">All Stalls</option>
                      {stalls.map((stall) => (
                        <option key={stall.stall_id} value={stall.stall_id}>
                          {stall.stall_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Right Half - Description */}
                <div className="flex flex-col justify-center items-end md:text-right">
                  <h2 className="text-lg font-bold text-primary mb-2">Global Date and Stall Filter</h2>
                  <p className="text-sm text-base-content/70">
                    Applies to all report sections. Local filters can still narrow down further.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error mb-6">
            <span>{error}</span>
            <button 
              className="btn btn-sm btn-circle btn-ghost"
              onClick={() => setError('')}
            >
              ×
            </button>
          </div>
        )}

        {success && (
          <div className="alert alert-success mb-6">
            <span>{success}</span>
            <button 
              className="btn btn-sm btn-circle btn-ghost"
              onClick={() => setSuccess('')}
            >
              ×
            </button>
          </div>
        )}

        {/* Cards Grid - 2 per row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Card 1: Sales Overview by Stall */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h2 className="card-title text-primary">Sales Overview by Stall</h2>
                <div className="flex gap-2">
                  <div className="form-control">
                    <div className="input-group">
                      <span className="btn btn-ghost btn-sm">Metric</span>
                      <select
                        className="select select-bordered select-sm"
                        value={chartMetric}
                        onChange={(e) => setChartMetric(e.target.value)}
                      >
                        <option value="sales">Total Sales</option>
                        <option value="transactions">Transactions</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              {/* Date Range Filter */}
              <div className="mb-4">
                <DateRangeFilter
                  startDate={salesDateRange.startDate}
                  endDate={salesDateRange.endDate}
                  onChange={(newStartDate, newEndDate) => {
                    setSalesDateRange({ startDate: newStartDate, endDate: newEndDate });
                  }}
                  options={{
                    allowFuture: false,
                    showPresets: true,
                    size: 'sm',
                  }}
                />
              </div>
              {salesByStall.length > 0 ? (
                <div className="w-full h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[...salesByStall].sort((a, b) => (chartMetric === 'sales' ? b.total_sales - a.total_sales : b.transaction_count - a.transaction_count))}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                      <XAxis 
                        dataKey="stall_name" 
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={60}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        tick={{ fill: '#9CA3AF', fontSize: 12 }}
                        tickFormatter={(v) => (chartMetric === 'sales' ? `₱${Number(v).toLocaleString()}` : `${v}`)}
                        width={chartMetric === 'sales' ? 80 : 50}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value) =>
                          chartMetric === 'sales'
                            ? [`₱${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Total Sales']
                            : [value, 'Transactions']
                        }
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#F9FAFB',
                          fontSize: '14px',
                          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)'
                        }}
                        cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                      />
                      <Bar
                        dataKey={chartMetric === 'sales' ? 'total_sales' : 'transaction_count'}
                        name={chartMetric === 'sales' ? 'Total Sales' : 'Transactions'}
                        fill={chartMetric === 'sales' ? '#3B82F6' : '#10B981'}
                        radius={[8, 8, 0, 0]}
                        maxBarSize={60}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center text-base-content/50 py-6">No sales data available</div>
              )}
            </div>
          </div>

          {/* Card 2: Detailed Transactions */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-secondary mb-4">Recent Transactions</h2>
              {/* Filters - admin only */}
              {userProfile?.role === 'admin' && (
                <div className="space-y-4 mb-4">
                  <DateRangeFilter
                    startDate={transactionsFilters.startDate}
                    endDate={transactionsFilters.endDate}
                    onChange={(newStartDate, newEndDate) => {
                      setTransactionsFilters((prev) => ({
                        ...prev,
                        startDate: newStartDate,
                        endDate: newEndDate,
                      }));
                    }}
                    options={{
                      allowFuture: false,
                      showPresets: true,
                      size: 'sm',
                    }}
                  />
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-xs">Stall</span>
                    </label>
                    <select
                      className="select select-bordered select-sm"
                      value={transactionsFilters.stallId}
                      onChange={(e) =>
                        setTransactionsFilters((prev) => ({
                          ...prev,
                          stallId: e.target.value,
                        }))
                      }
                    >
                      <option value="">All Stalls</option>
                      {stalls.map((stall) => (
                        <option key={stall.stall_id} value={stall.stall_id}>
                          {stall.stall_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto max-h-96">
                <table className="table table-zebra w-full">
                  <thead className="sticky top-0 z-10 bg-base-100">
                    <tr>
                      <th className="bg-base-100">Date</th>
                      <th className="bg-base-100">Stall</th>
                      <th className="bg-base-100">Item</th>
                      <th className="bg-base-100">Qty</th>
                      <th className="bg-base-100">Amount</th>
                      <th className="bg-base-100">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr
                        key={transaction.sale_id}
                        className={userProfile?.role === 'admin' ? 'hover cursor-pointer' : ''}
                        onClick={() => {
                          if (userProfile?.role !== 'admin') return;
                          const currentMenuItem =
                            menuItems.find((mi) => mi.item_id === transaction.product_id) || null;
                          const inferredUnitPrice =
                            currentMenuItem?.price ??
                            transaction.menu_items?.price ??
                            (transaction.quantity_sold
                              ? transaction.total_amount / transaction.quantity_sold
                              : 0);
                          setEditingTransaction({
                            ...transaction,
                            sale_date: transaction.sale_date?.slice(0, 10) || '',
                            product_id: transaction.product_id || currentMenuItem?.item_id || '',
                            unit_price: inferredUnitPrice,
                          });
                        }}
                      >
                        <td>{new Date(transaction.sale_date).toLocaleDateString()}</td>
                        <td>{transaction.stalls?.stall_name || 'N/A'}</td>
                        <td>{transaction.menu_items?.item_name || 'N/A'}</td>
                        <td>{transaction.quantity_sold}</td>
                        <td className="text-success font-bold">₱{transaction.total_amount.toFixed(2)}</td>
                        <td>
                          <span className={`badge ${transaction.payment_method === 'cash' ? 'badge-primary' : 'badge-secondary'}`}>
                            {transaction.payment_method}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan="6" className="text-center text-base-content/50 py-4">
                          No transactions found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="text-center text-base-content/50 py-4">
                    No transactions found
                  </div>
                ) : (
                  transactions.map((transaction) => {
                    const handleClick = () => {
                      if (userProfile?.role !== 'admin') return;
                      const currentMenuItem =
                        menuItems.find((mi) => mi.item_id === transaction.product_id) || null;
                      const inferredUnitPrice =
                        currentMenuItem?.price ??
                        transaction.menu_items?.price ??
                        (transaction.quantity_sold
                          ? transaction.total_amount / transaction.quantity_sold
                          : 0);
                      setEditingTransaction({
                        ...transaction,
                        sale_date: transaction.sale_date?.slice(0, 10) || '',
                        product_id: transaction.product_id || currentMenuItem?.item_id || '',
                        unit_price: inferredUnitPrice,
                      });
                    };
                    return (
                      <div
                        key={transaction.sale_id}
                        className={`card bg-base-200 shadow-sm ${userProfile?.role === 'admin' ? 'cursor-pointer' : ''}`}
                        onClick={handleClick}
                      >
                        <div className="card-body p-3">
                          {/* Name Header Section */}
                          <div className="mb-3">
                            <p className="font-semibold text-sm mb-1">{transaction.menu_items?.item_name || 'N/A'}</p>
                            <p className="text-xs text-base-content/70">{new Date(transaction.sale_date).toLocaleDateString()}</p>
                          </div>
                          
                          {/* Price Section with Divider */}
                          <div className="mb-3 pb-2 border-b border-base-300">
                            <p className="text-success font-bold text-xl">₱{transaction.total_amount.toFixed(2)}</p>
                          </div>
                          
                          {/* Details Grid */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-base-content/70">Stall: </span>
                              <span className="font-medium">{transaction.stalls?.stall_name || 'N/A'}</span>
                            </div>
                            <div className="flex justify-end items-center">
                              <span className="text-base-content/70">Qty: </span>
                              <span className="font-medium">{transaction.quantity_sold}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-base-content/70">Payment: </span>
                              <span className={`badge badge-sm ${transaction.payment_method === 'cash' ? 'badge-primary' : 'badge-secondary'}`}>
                                {transaction.payment_method}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 3: Expenses Report */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-error mb-4">Recent Expenses</h2>
              {/* Filters - admin only */}
              {userProfile?.role === 'admin' && (
                <div className="space-y-4 mb-4">
                  <DateRangeFilter
                    startDate={expensesFilters.startDate}
                    endDate={expensesFilters.endDate}
                    onChange={(newStartDate, newEndDate) => {
                      setExpensesFilters((prev) => ({
                        ...prev,
                        startDate: newStartDate,
                        endDate: newEndDate,
                      }));
                    }}
                    options={{
                      allowFuture: false,
                      showPresets: true,
                      size: 'sm',
                    }}
                  />
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-xs">Stall</span>
                    </label>
                    <select
                      className="select select-bordered select-sm"
                      value={expensesFilters.stallId}
                      onChange={(e) =>
                        setExpensesFilters((prev) => ({
                          ...prev,
                          stallId: e.target.value,
                        }))
                      }
                    >
                      <option value="">All Stalls</option>
                      <option value="__none__">Non-affiliated (No Stall)</option>
                      {stalls.map((stall) => (
                        <option key={stall.stall_id} value={stall.stall_id}>
                          {stall.stall_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto max-h-96">
                <table className="table table-zebra w-full">
                  <thead className="sticky top-0 z-10 bg-base-100">
                    <tr>
                      <th className="bg-base-100">Name</th>
                      <th className="bg-base-100">Qty</th>
                      <th className="bg-base-100">Cost</th>
                      <th className="bg-base-100">Date</th>
                      <th className="bg-base-100">Stall</th>
                      <th className="bg-base-100">Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr
                        key={expense.expense_id}
                        className={userProfile?.role === 'admin' ? 'hover cursor-pointer' : ''}
                        onClick={() => {
                          if (userProfile?.role !== 'admin') return;
                          setEditingExpense({
                            ...expense,
                            date: expense.date?.slice(0, 10) || '',
                          });
                        }}
                      >
                        <td className="font-medium">{expense.expense_name}</td>
                        <td>{expense.quantity || 'N/A'}</td>
                        <td className="text-error font-bold">₱{Number(expense.cost).toFixed(2)}</td>
                        <td>{expense.date}</td>
                        <td>{expense.stalls?.stall_name || 'N/A'}</td>
                        <td>{expense.supplier_name || 'N/A'}</td>
                      </tr>
                    ))}
                    {expenses.length === 0 && (
                      <tr>
                        <td colSpan="6" className="text-center text-base-content/50 py-4">
                          No expenses recorded
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                {expenses.length === 0 ? (
                  <div className="text-center text-base-content/50 py-4">
                    No expenses recorded
                  </div>
                ) : (
                  expenses.map((expense) => {
                    const handleClick = () => {
                      if (userProfile?.role !== 'admin') return;
                      setEditingExpense({
                        ...expense,
                        date: expense.date?.slice(0, 10) || '',
                      });
                    };
                    return (
                      <div
                        key={expense.expense_id}
                        className={`card bg-base-200 shadow-sm ${userProfile?.role === 'admin' ? 'cursor-pointer' : ''}`}
                        onClick={handleClick}
                      >
                        <div className="card-body p-3">
                          {/* Name Header Section */}
                          <div className="mb-3">
                            <p className="font-semibold text-sm mb-1">{expense.expense_name}</p>
                            <p className="text-xs text-base-content/70">{expense.date}</p>
                          </div>
                          
                          {/* Price Section with Divider */}
                          <div className="mb-3 pb-2 border-b border-base-300">
                            <p className="text-error font-bold text-xl">₱{Number(expense.cost).toFixed(2)}</p>
                          </div>
                          
                          {/* Details Grid */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-base-content/70">Stall: </span>
                              <span className="font-medium">{expense.stalls?.stall_name || 'N/A'}</span>
                            </div>
                            <div className="flex justify-end items-center">
                              <span className="text-base-content/70">Qty: </span>
                              <span className="font-medium">{expense.quantity || 'N/A'}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-base-content/70">Supplier: </span>
                              <span className="font-medium">{expense.supplier_name || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Statistics */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-accent mb-4">Key Statistics</h2>
              {/* Filters - admin only */}
              {userProfile?.role === 'admin' && (
                <div className="space-y-4 mb-4">
                  <DateRangeFilter
                    startDate={statisticsFilters.startDate}
                    endDate={statisticsFilters.endDate}
                    onChange={(newStartDate, newEndDate) => {
                      setStatisticsFilters((prev) => ({
                        ...prev,
                        startDate: newStartDate,
                        endDate: newEndDate,
                      }));
                    }}
                    options={{
                      allowFuture: false,
                      showPresets: true,
                      size: 'sm',
                    }}
                  />
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-xs">Stall</span>
                    </label>
                    <select
                      className="select select-bordered select-sm"
                      value={statisticsFilters.stallId}
                      onChange={(e) =>
                        setStatisticsFilters((prev) => ({
                          ...prev,
                          stallId: e.target.value,
                        }))
                      }
                    >
                      <option value="">All Stalls</option>
                      {stalls.map((stall) => (
                        <option key={stall.stall_id} value={stall.stall_id}>
                          {stall.stall_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div className="stat">
                  <div className="stat-title">Total Sales</div>
                  <div className="stat-value text-success">₱{statistics.totalSales.toFixed(2)}</div>
                </div>
                
                <div className="stat">
                  <div className="stat-title">Total Expenses</div>
                  <div className="stat-value text-error">₱{statistics.totalExpenses.toFixed(2)}</div>
                </div>

                <div className="stat">
                  <div className="stat-title">Net Profit</div>
                  <div className={`stat-value ${(statistics.totalSales - statistics.totalExpenses) >= 0 ? 'text-success' : 'text-error'}`}>
                    ₱{(statistics.totalSales - statistics.totalExpenses).toFixed(2)}
                  </div>
                </div>

                <div className="divider"></div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Highest Earning Stall:</span>
                    <span className="text-success font-bold">
                      {statistics.highestEarningStall ? 
                        `${statistics.highestEarningStall.stall_name} (₱${statistics.highestEarningStall.total.toFixed(2)})` : 
                        'N/A'
                      }
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Lowest Earning Stall:</span>
                    <span className="text-warning font-bold">
                      {statistics.lowestEarningStall ? 
                        `${statistics.lowestEarningStall.stall_name} (₱${statistics.lowestEarningStall.total.toFixed(2)})` : 
                        'N/A'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Third Row - History cards (admin only) */}
        {userProfile?.role === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Stock History */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                  <div>
                    <h2 className="card-title text-primary">Stock History</h2>
                    <p className="text-xs text-base-content/70">
                      Daily stock levels and sold-out status per stall.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-4">
                  <DateRangeFilter
                    startDate={stockHistoryFilters.startDate}
                    endDate={stockHistoryFilters.endDate}
                    onChange={(newStartDate, newEndDate) => {
                      setStockHistoryFilters((prev) => ({
                        ...prev,
                        startDate: newStartDate,
                        endDate: newEndDate,
                      }));
                    }}
                    options={{
                      allowFuture: false,
                      showPresets: true,
                      size: 'sm',
                    }}
                  />
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-xs">Stall</span>
                    </label>
                    <select
                      className="select select-bordered select-sm"
                      value={stockHistoryFilters.stallId}
                      onChange={(e) =>
                        setStockHistoryFilters((prev) => ({
                          ...prev,
                          stallId: e.target.value,
                        }))
                      }
                    >
                      <option value="">All Stalls</option>
                      {stalls.map((stall) => (
                        <option key={stall.stall_id} value={stall.stall_id}>
                          {stall.stall_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto max-h-96">
                  <table className="table table-zebra w-full">
                    <thead className="sticky top-0 z-10 bg-base-100">
                      <tr>
                        <th className="bg-base-100">Date</th>
                        <th className="bg-base-100">Time</th>
                        <th className="bg-base-100">Stall</th>
                        <th className="bg-base-100">Stock Level</th>
                        <th className="bg-base-100">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockHistory.map((row) => (
                        <tr
                          key={row.id}
                          className="hover cursor-pointer"
                          onClick={() => {
                            const dateStr = row.date
                              ? new Date(row.date).toISOString().slice(0, 10)
                              : '';
                            const timeStr = row.created_at
                              ? new Date(row.created_at).toTimeString().slice(0, 5)
                              : '';
                            setEditingStockHistory({
                              ...row,
                              date: dateStr,
                              time: timeStr,
                            });
                          }}
                        >
                          <td>{new Date(row.date).toLocaleDateString()}</td>
                          <td>{row.created_at ? new Date(row.created_at).toLocaleTimeString() : 'N/A'}</td>
                          <td>{row.stalls?.stall_name || `Stall ${row.stall_id}`}</td>
                          <td>{row.stock_level ?? 'N/A'}</td>
                          <td>
                            <span
                              className={`badge badge-sm md:badge-md whitespace-nowrap ${
                                row.stock_status === 'sold_out'
                                  ? 'badge-error'
                                  : row.stock_status === 'not_sold_out'
                                  ? 'badge-success'
                                  : 'badge-neutral'
                              }`}
                            >
                              {row.stock_status === 'sold_out'
                                ? 'Sold Out'
                                : row.stock_status === 'not_sold_out'
                                ? 'Not Sold Out'
                                : row.stock_status || 'Unknown'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {stockHistory.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center text-base-content/50 py-4">
                            No stock history records found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                  {stockHistory.length === 0 ? (
                    <div className="text-center text-base-content/50 py-4">
                      No stock history records found
                    </div>
                  ) : (
                    stockHistory.map((row) => {
                      const handleClick = () => {
                        const dateStr = row.date
                          ? new Date(row.date).toISOString().slice(0, 10)
                          : '';
                        const timeStr = row.created_at
                          ? new Date(row.created_at).toTimeString().slice(0, 5)
                          : '';
                        setEditingStockHistory({
                          ...row,
                          date: dateStr,
                          time: timeStr,
                        });
                      };
                      return (
                        <div
                          key={row.id}
                          className="card bg-base-200 shadow-sm cursor-pointer"
                          onClick={handleClick}
                        >
                          <div className="card-body p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-semibold text-sm">{row.stalls?.stall_name || `Stall ${row.stall_id}`}</p>
                                <p className="text-xs text-base-content/70">
                                  {new Date(row.date).toLocaleDateString()} {row.created_at ? new Date(row.created_at).toLocaleTimeString() : ''}
                                </p>
                              </div>
                              <span
                                className={`badge badge-sm whitespace-nowrap ${
                                  row.stock_status === 'sold_out'
                                    ? 'badge-error'
                                    : row.stock_status === 'not_sold_out'
                                    ? 'badge-success'
                                    : 'badge-neutral'
                                }`}
                              >
                                {row.stock_status === 'sold_out'
                                  ? 'Sold Out'
                                  : row.stock_status === 'not_sold_out'
                                  ? 'Not Sold Out'
                                  : row.stock_status || 'Unknown'}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-base-content/70">Stock Level: </span>
                              <span className="font-medium">{row.stock_level ?? 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Activity History */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                  <div>
                    <h2 className="card-title text-secondary">Activity History</h2>
                    <p className="text-xs text-base-content/70">
                      Daily stall activity based on Manage Inventory status changes.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-4">
                  <DateRangeFilter
                    startDate={activityHistoryFilters.startDate}
                    endDate={activityHistoryFilters.endDate}
                    onChange={(newStartDate, newEndDate) => {
                      setActivityHistoryFilters((prev) => ({
                        ...prev,
                        startDate: newStartDate,
                        endDate: newEndDate,
                      }));
                    }}
                    options={{
                      allowFuture: false,
                      showPresets: true,
                      size: 'sm',
                    }}
                  />
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-xs">Stall</span>
                    </label>
                    <select
                      className="select select-bordered select-sm"
                      value={activityHistoryFilters.stallId}
                      onChange={(e) =>
                        setActivityHistoryFilters((prev) => ({
                          ...prev,
                          stallId: e.target.value,
                        }))
                      }
                    >
                      <option value="">All Stalls</option>
                      {stalls.map((stall) => (
                        <option key={stall.stall_id} value={stall.stall_id}>
                          {stall.stall_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto max-h-96">
                  <table className="table table-zebra w-full">
                    <thead className="sticky top-0 z-10 bg-base-100">
                      <tr>
                        <th className="bg-base-100">Date</th>
                        <th className="bg-base-100">Time</th>
                        <th className="bg-base-100">Stall</th>
                        <th className="bg-base-100">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityHistory.map((row) => (
                        <tr
                          key={row.id}
                          className="hover cursor-pointer"
                          onClick={() => {
                            const dateStr = row.date
                              ? new Date(row.date).toISOString().slice(0, 10)
                              : '';
                            const timeStr = row.changed_at
                              ? new Date(row.changed_at).toTimeString().slice(0, 5)
                              : '';
                            setEditingActivityHistory({
                              ...row,
                              date: dateStr,
                              time: timeStr,
                            });
                          }}
                        >
                          <td>{new Date(row.date).toLocaleDateString()}</td>
                          <td>{row.changed_at ? new Date(row.changed_at).toLocaleTimeString() : 'N/A'}</td>
                          <td>{row.stalls?.stall_name || `Stall ${row.stall_id}`}</td>
                          <td>
                            <span
                              className={`badge ${
                                row.status === 'active'
                                  ? 'badge-success'
                                  : row.status === 'inactive'
                                  ? 'badge-error'
                                  : row.status === 'under maintenance'
                                  ? 'badge-warning'
                                  : 'badge-neutral'
                              }`}
                            >
                              {row.status || 'Unknown'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {activityHistory.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center text-base-content/50 py-4">
                            No activity history records found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 max-h-96 overflow-y-auto">
                  {activityHistory.length === 0 ? (
                    <div className="text-center text-base-content/50 py-4">
                      No activity history records found
                    </div>
                  ) : (
                    activityHistory.map((row) => {
                      const handleClick = () => {
                        const dateStr = row.date
                          ? new Date(row.date).toISOString().slice(0, 10)
                          : '';
                        const timeStr = row.changed_at
                          ? new Date(row.changed_at).toTimeString().slice(0, 5)
                          : '';
                        setEditingActivityHistory({
                          ...row,
                          date: dateStr,
                          time: timeStr,
                        });
                      };
                      return (
                        <div
                          key={row.id}
                          className="card bg-base-200 shadow-sm cursor-pointer"
                          onClick={handleClick}
                        >
                          <div className="card-body p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-semibold text-sm">{row.stalls?.stall_name || `Stall ${row.stall_id}`}</p>
                                <p className="text-xs text-base-content/70">
                                  {new Date(row.date).toLocaleDateString()} {row.changed_at ? new Date(row.changed_at).toLocaleTimeString() : ''}
                                </p>
                              </div>
                              <span
                                className={`badge badge-sm ${
                                  row.status === 'active'
                                    ? 'badge-success'
                                    : row.status === 'inactive'
                                    ? 'badge-error'
                                    : row.status === 'under maintenance'
                                    ? 'badge-warning'
                                    : 'badge-neutral'
                                }`}
                              >
                                {row.status || 'Unknown'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modals (admin only) */}
        {userProfile?.role === 'admin' && editingTransaction && (
          <div className="modal modal-open">
            <div className="modal-box max-w-3xl">
              <h3 className="font-bold text-lg mb-4">Edit Transaction</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Date</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered input-sm"
                    value={editingTransaction.sale_date || ''}
                    onChange={(e) =>
                      setEditingTransaction((prev) => ({ ...prev, sale_date: e.target.value }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Stall</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingTransaction.stall_id}
                    onChange={(e) =>
                      setEditingTransaction((prev) => ({ ...prev, stall_id: e.target.value }))
                    }
                  >
                    {stalls.map((stall) => (
                      <option key={stall.stall_id} value={stall.stall_id}>
                        {stall.stall_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Item</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingTransaction.product_id || ''}
                    onChange={(e) => {
                      const nextItemId = e.target.value;
                      const nextItem =
                        menuItems.find((mi) => String(mi.item_id) === String(nextItemId)) || null;
                      if (!nextItem) {
                        setEditingTransaction((prev) => ({
                          ...prev,
                          product_id: nextItemId,
                        }));
                        return;
                      }
                      const qty = Number(editingTransaction.quantity_sold) || 0;
                      const nextUnitPrice = Number(nextItem.price) || 0;
                      setEditingTransaction((prev) => ({
                        ...prev,
                        product_id: nextItem.item_id,
                        unit_price: nextUnitPrice,
                        total_amount: qty * nextUnitPrice,
                        menu_items: {
                          ...(prev.menu_items || {}),
                          item_name: nextItem.item_name,
                          price: nextUnitPrice,
                        },
                      }));
                    }}
                  >
                    <option value="">Select item</option>
                    {menuItems.map((item) => (
                      <option key={item.item_id} value={item.item_id}>
                        {item.item_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Quantity</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered input-sm"
                    value={editingTransaction.quantity_sold}
                    min="1"
                    onChange={(e) => {
                      const qty = Number(e.target.value) || 0;
                      const price = Number(editingTransaction.unit_price) || 0;
                      setEditingTransaction((prev) => ({
                        ...prev,
                        quantity_sold: qty,
                        total_amount: qty * price,
                      }));
                    }}
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Amount</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered input-sm"
                    value={editingTransaction.total_amount}
                    readOnly
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Payment Method</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingTransaction.payment_method}
                    onChange={(e) =>
                      setEditingTransaction((prev) => ({
                        ...prev,
                        payment_method: e.target.value,
                      }))
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="Gcash">Gcash</option>
                  </select>
                </div>
              </div>
              <div className="modal-action">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleEditTransaction(editingTransaction, editingTransaction)}
                  disabled={editLoading}
                >
                  Save
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingTransaction(null)}
                  disabled={editLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {userProfile?.role === 'admin' && editingExpense && (
          <div className="modal modal-open">
            <div className="modal-box max-w-3xl">
              <h3 className="font-bold text-lg mb-4">Edit Expense</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Name</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    value={editingExpense.expense_name}
                    onChange={(e) =>
                      setEditingExpense((prev) => ({ ...prev, expense_name: e.target.value }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Quantity</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    value={editingExpense.quantity || ''}
                    onChange={(e) =>
                      setEditingExpense((prev) => ({ ...prev, quantity: e.target.value }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Cost</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered input-sm"
                    value={editingExpense.cost}
                    min="0"
                    step="0.01"
                    onChange={(e) =>
                      setEditingExpense((prev) => ({ ...prev, cost: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Date</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered input-sm"
                    value={editingExpense.date || ''}
                    onChange={(e) =>
                      setEditingExpense((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Stall</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingExpense.stall_id || ''}
                    onChange={(e) =>
                      setEditingExpense((prev) => ({
                        ...prev,
                        stall_id: e.target.value || null,
                      }))
                    }
                  >
                    <option value="">None</option>
                    {stalls.map((stall) => (
                      <option key={stall.stall_id} value={stall.stall_id}>
                        {stall.stall_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control md:col-span-2">
                  <label className="label">
                    <span className="label-text text-xs">Supplier</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    value={editingExpense.supplier_name || ''}
                    onChange={(e) =>
                      setEditingExpense((prev) => ({
                        ...prev,
                        supplier_name: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="modal-action">
                <button
                  className="btn btn-error btn-sm"
                  onClick={() => handleDeleteExpense(editingExpense.expense_id)}
                  disabled={editLoading}
                >
                  Delete
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingExpense(null)}
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleEditExpense(editingExpense, editingExpense)}
                  disabled={editLoading}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {userProfile?.role === 'admin' && editingStockHistory && (
          <div className="modal modal-open">
            <div className="modal-box max-w-3xl">
              <h3 className="font-bold text-lg mb-4">Edit Stock History</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Date</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered input-sm"
                    value={editingStockHistory.date || ''}
                    onChange={(e) =>
                      setEditingStockHistory((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Time</span>
                  </label>
                  <input
                    type="time"
                    className="input input-bordered input-sm"
                    value={editingStockHistory.time || ''}
                    onChange={(e) =>
                      setEditingStockHistory((prev) => ({ ...prev, time: e.target.value }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Stall</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingStockHistory.stall_id}
                    onChange={(e) =>
                      setEditingStockHistory((prev) => ({
                        ...prev,
                        stall_id: e.target.value,
                      }))
                    }
                  >
                    {stalls.map((stall) => (
                      <option key={stall.stall_id} value={stall.stall_id}>
                        {stall.stall_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Stock Level</span>
                  </label>
                  <input
                    type="number"
                    className="input input-bordered input-sm"
                    value={editingStockHistory.stock_level ?? ''}
                    onChange={(e) =>
                      setEditingStockHistory((prev) => ({
                        ...prev,
                        stock_level: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="form-control md:col-span-2">
                  <label className="label">
                    <span className="label-text text-xs">Status</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingStockHistory.stock_status}
                    onChange={(e) =>
                      setEditingStockHistory((prev) => ({
                        ...prev,
                        stock_status: e.target.value,
                      }))
                    }
                  >
                    <option value="sold_out">Sold Out</option>
                    <option value="not_sold_out">Not Sold Out</option>
                  </select>
                </div>
              </div>
              <div className="modal-action">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleEditStockHistory}
                  disabled={editLoading}
                >
                  Save
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingStockHistory(null)}
                  disabled={editLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {userProfile?.role === 'admin' && editingActivityHistory && (
          <div className="modal modal-open">
            <div className="modal-box max-w-3xl">
              <h3 className="font-bold text-lg mb-4">Edit Activity History</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Date</span>
                  </label>
                  <input
                    type="date"
                    className="input input-bordered input-sm"
                    value={editingActivityHistory.date || ''}
                    onChange={(e) =>
                      setEditingActivityHistory((prev) => ({
                        ...prev,
                        date: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Time</span>
                  </label>
                  <input
                    type="time"
                    className="input input-bordered input-sm"
                    value={editingActivityHistory.time || ''}
                    onChange={(e) =>
                      setEditingActivityHistory((prev) => ({
                        ...prev,
                        time: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Stall</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingActivityHistory.stall_id}
                    onChange={(e) =>
                      setEditingActivityHistory((prev) => ({
                        ...prev,
                        stall_id: e.target.value,
                      }))
                    }
                  >
                    {stalls.map((stall) => (
                      <option key={stall.stall_id} value={stall.stall_id}>
                        {stall.stall_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-xs">Status</span>
                  </label>
                  <select
                    className="select select-bordered select-sm"
                    value={editingActivityHistory.status}
                    onChange={(e) =>
                      setEditingActivityHistory((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="under maintenance">under maintenance</option>
                  </select>
                </div>
              </div>
              <div className="modal-action">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleEditActivityHistory}
                  disabled={editLoading}
                >
                  Save
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingActivityHistory(null)}
                  disabled={editLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Delete Expense Modal */}
        <ConfirmModal
          isOpen={confirmDeleteExpense.isOpen}
          title="Delete Expense"
          message="Are you sure you want to delete this expense? This action cannot be undone."
          onConfirm={handleConfirmDeleteExpense}
          onCancel={() => setConfirmDeleteExpense({ isOpen: false, expenseId: null })}
          confirmText="Delete"
          cancelText="Cancel"
          variant="error"
        />
      </div>
    </Layout>
  );
}

export default Reports;
