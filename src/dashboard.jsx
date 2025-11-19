import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { isAdmin } from './utils/roleUtils';
import { getPHDateString, getPHDate, formatPHDate, parseSaleDate } from './utils/dateUtils';
import {
    restrictToStaffStallAndToday,
    fetchCurrentStallStockForStaff,
    fetchTodaySalesTotalForStaff,
    fetchTodayStockStatus,
    saveTodayStockStatus,
} from './utils/staffReportsToday';
import Layout from './components/Layout';
import { useProfile } from './contexts/ProfileContext';
// Charts
import {
    Chart as ChartJS,
    ArcElement,
    BarElement,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Title,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(ArcElement, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Title);

function Dashboard() {
    const { profile: userProfile, loading: profileLoading } = useProfile();
    const [loading, setLoading] = useState(true);
    
    // Chart data states
    const [stockByStall, setStockByStall] = useState([]);
    const [salesVsExpense, setSalesVsExpense] = useState({ sales: 0, expenses: 0 });
    const [bestSellers, setBestSellers] = useState([]);
    const [chartsLoading, setChartsLoading] = useState(true);
    const [stallsStatus, setStallsStatus] = useState([]);
    
    // Line chart states
    const [timeBasedSales, setTimeBasedSales] = useState([]);
    const [selectedStall, setSelectedStall] = useState('all');
    const [timePeriod, setTimePeriod] = useState('yesterday');
    const [availableStalls, setAvailableStalls] = useState([]);

    // Staff dashboard states
    const [staffTransactions, setStaffTransactions] = useState([]);
    const [staffStatistics, setStaffStatistics] = useState({
        totalSales: 0,
        stockDistributed: 0,
        stockStatus: 'not_sold_out',
    });
    const [staffCardsLoading, setStaffCardsLoading] = useState(true);
    const [updatingStockStatus, setUpdatingStockStatus] = useState(false);

    // Load stock by stall data
    const loadStockByStall = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('stall_stocks')
                .select(`
                    stall_id,
                    quantity,
                    stalls(stall_name)
                `);

            if (error) throw error;

            // Group by stall and calculate totals
            const stallStock = {};
            data?.forEach(stock => {
                const stallId = stock.stall_id;
                const stallName = stock.stalls?.stall_name || `Stall ${stallId}`;
                
                if (!stallStock[stallId]) {
                    stallStock[stallId] = {
                        stall_id: stallId,
                        stall_name: stallName,
                        total_stock: 0
                    };
                }
                stallStock[stallId].total_stock += Number(stock.quantity || 0);
            });

            setStockByStall(Object.values(stallStock));
        } catch (err) {
            console.error('Error loading stock by stall:', err);
        }
    }, []);

    // Load sales vs expenses data
    const loadSalesVsExpense = useCallback(async () => {
        try {
            // Use same 12-month filter as line chart with Philippines timezone
            const now = getPHDate();
            const twelveMonthsAgo = new Date(now);
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
            const twelveMonthsAgoStr = getPHDateString(twelveMonthsAgo);

            // Get total sales
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select('total_amount')
                .gte('sale_date', twelveMonthsAgoStr);

            if (salesError) throw salesError;

            // Get total expenses
            const { data: expensesData, error: expensesError } = await supabase
                .from('expenses')
                .select('cost')
                .gte('date', twelveMonthsAgoStr);

            if (expensesError) throw expensesError;

            const totalSales = salesData?.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) || 0;
            const totalExpenses = expensesData?.reduce((sum, expense) => sum + Number(expense.cost || 0), 0) || 0;

            setSalesVsExpense({ sales: totalSales, expenses: totalExpenses });
        } catch (err) {
            console.error('Error loading sales vs expenses:', err);
        }
    }, []);

    // Load best sellers data
    const loadBestSellers = useCallback(async () => {
        try {
            // Use same 12-month filter as line chart with Philippines timezone
            const now = getPHDate();
            const twelveMonthsAgo = new Date(now);
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
            const twelveMonthsAgoStr = getPHDateString(twelveMonthsAgo);

            const { data, error } = await supabase
                .from('sales')
                .select(`
                    quantity_sold,
                    menu_items(item_name)
                `)
                .gte('sale_date', twelveMonthsAgoStr);

            if (error) throw error;

            // Group by item and calculate totals
            const itemSales = {};
            data?.forEach(sale => {
                const itemName = sale.menu_items?.item_name || 'Unknown Item';
                
                if (!itemSales[itemName]) {
                    itemSales[itemName] = {
                        item_name: itemName,
                        units_sold: 0
                    };
                }
                itemSales[itemName].units_sold += Number(sale.quantity_sold || 0);
            });

            // Sort by units sold and take top 4
            const sortedItems = Object.values(itemSales)
                .sort((a, b) => b.units_sold - a.units_sold)
                .slice(0, 4);

            setBestSellers(sortedItems);
        } catch (err) {
            console.error('Error loading best sellers:', err);
        }
    }, []);

    // Load time-based sales data for line chart
    const loadTimeBasedSales = useCallback(async () => {
        try {
            let startDate, endDate, groupBy;
            // Get current date in Philippines timezone
            const now = getPHDate();
            
            if (timePeriod === 'yesterday') {
                // Show yesterday in context of last 7 days for better visualization
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                startDate = new Date(yesterday);
                startDate.setDate(startDate.getDate() - 6); // Go back 6 more days (7 days total)
                endDate = new Date(yesterday);
                groupBy = 'day';
            } else if (timePeriod === 'week') {
                // Last 7 days including today
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 6);
                endDate = new Date(now);
                groupBy = 'day';
            } else if (timePeriod === 'month') {
                // Last 12 months
                startDate = new Date(now);
                startDate.setMonth(startDate.getMonth() - 11);
                startDate.setDate(1);
                endDate = new Date(now);
                groupBy = 'month';
            }

            const startDateStr = getPHDateString(startDate);
            const endDateStr = getPHDateString(endDate);

            let query = supabase
                .from('sales')
                .select(`
                    sale_date,
                    total_amount,
                    stall_id,
                    stalls(stall_name)
                `)
                .gte('sale_date', startDateStr)
                .lte('sale_date', endDateStr)
                .order('sale_date', { ascending: true });

            // Filter by selected stall if not 'all'
            if (selectedStall !== 'all') {
                query = query.eq('stall_id', selectedStall);
            }

            const { data, error } = await query;

            if (error) throw error;

            // Group data by time period - parse sale_date as PH date
            const groupedData = {};
            data?.forEach(sale => {
                // Parse sale_date string (YYYY-MM-DD) as PH date
                const saleDateStr = parseSaleDate(sale.sale_date);
                let key;

                if (groupBy === 'day') {
                    key = saleDateStr; // Already YYYY-MM-DD format
                } else if (groupBy === 'month') {
                    const [year, month] = saleDateStr.split('-');
                    key = `${year}-${month}`;
                }

                if (!groupedData[key]) {
                    groupedData[key] = {
                        period: key,
                        sales: 0,
                        transactions: 0
                    };
                }
                groupedData[key].sales += Number(sale.total_amount || 0);
                groupedData[key].transactions += 1;
            });

            // Convert to array and sort
            const timeBasedData = Object.values(groupedData).sort((a, b) => {
                if (groupBy === 'day') {
                    return a.period.localeCompare(b.period);
                } else if (groupBy === 'month') {
                    return a.period.localeCompare(b.period);
                }
                return 0;
            });

            setTimeBasedSales(timeBasedData);
        } catch (err) {
            console.error('Error loading time-based sales:', err);
        }
    }, [selectedStall, timePeriod]);

    // Load available stalls for dropdown
    const loadAvailableStalls = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('stalls')
                .select('stall_id, stall_name')
                .order('stall_name');

            if (error) throw error;
            setAvailableStalls(data || []);
        } catch (err) {
            console.error('Error loading stalls:', err);
        }
    }, []);

    // Load stalls status data, including today's stock sold-out status
    const loadStallsStatus = useCallback(async () => {
        try {
            // First load all business stalls
            const { data: stallsData, error: stallsError } = await supabase
                .from('stalls')
                .select('stall_id, stall_name, location, status')
                .order('stall_name');

            if (stallsError) throw stallsError;

            const stalls = stallsData || [];

            // If there are no stalls, we can short-circuit
            if (stalls.length === 0) {
                setStallsStatus([]);
                return;
            }

            // Build today's date range in PH timezone (same logic as staffReportsToday helpers)
            const today = getPHDate();
            const todayStr = getPHDateString(today);

            // Fetch today's stock status for all stalls in a single query
            const stallIds = stalls.map((stall) => stall.stall_id);
            const { data: stockStatusData, error: stockStatusError } = await supabase
                .from('stock_status_history')
                .select('stall_id, stock_status, stock_level, date')
                .in('stall_id', stallIds)
                .eq('date', todayStr);

            if (stockStatusError) throw stockStatusError;

            // Build a lookup map for today's stock status per stall
            const stockStatusByStallId = {};
            (stockStatusData || []).forEach((row) => {
                stockStatusByStallId[row.stall_id] = {
                    stockStatus: row.stock_status || 'not_sold_out',
                    stockLevel:
                        typeof row.stock_level === 'number'
                            ? row.stock_level
                            : Number(row.stock_level || 0),
                };
            });

            // Merge business status with today's stock status, defaulting to not_sold_out
            const merged = stalls.map((stall) => {
                const stockInfo = stockStatusByStallId[stall.stall_id] || {
                    stockStatus: 'not_sold_out',
                    stockLevel: null,
                };

                return {
                    ...stall,
                    stockStatus: stockInfo.stockStatus,
                    stockLevel: stockInfo.stockLevel,
                };
            });

            setStallsStatus(merged);
        } catch (err) {
            console.error('Error loading stalls status:', err);
        }
    }, []);

    // Staff: load recent transactions for today for their stall
    const loadStaffRecentTransactions = useCallback(async () => {
        if (!userProfile) return;
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
                    menu_items(item_name)
                `);

            query = restrictToStaffStallAndToday(query, userProfile, { dateColumn: 'sale_date' });

            const { data, error } = await query
                .order('sale_date', { ascending: false })
                .limit(10);

            if (error) throw error;
            setStaffTransactions(data || []);
        } catch (err) {
            console.error('Error loading staff recent transactions:', err);
        }
    }, [userProfile]);

    // Staff: load key statistics for today for their stall
    const loadStaffStatistics = useCallback(async () => {
        if (!userProfile) return;
        try {
            const [stockDistributed, totalSales, stockStatusInfo] = await Promise.all([
                fetchCurrentStallStockForStaff(userProfile),
                fetchTodaySalesTotalForStaff(userProfile),
                fetchTodayStockStatus(userProfile.stall_id),
            ]);

            setStaffStatistics({
                totalSales: totalSales || 0,
                stockDistributed: stockDistributed || 0,
                stockStatus: stockStatusInfo?.stockStatus || 'not_sold_out',
            });
        } catch (err) {
            console.error('Error loading staff statistics:', err);
        }
    }, [userProfile]);

    const loadStaffDashboardData = useCallback(async () => {
        setStaffCardsLoading(true);
        try {
            await Promise.all([
                loadStaffRecentTransactions(),
                loadStaffStatistics(),
            ]);
        } catch (err) {
            console.error('Error loading staff dashboard data:', err);
        } finally {
            setStaffCardsLoading(false);
        }
    }, [loadStaffRecentTransactions, loadStaffStatistics]);

    const handleToggleStockStatus = async () => {
        if (!userProfile) return;

        const nextStatus =
            staffStatistics.stockStatus === 'sold_out' ? 'not_sold_out' : 'sold_out';

        setUpdatingStockStatus(true);
        try {
            await saveTodayStockStatus(
                userProfile.stall_id,
                staffStatistics.stockDistributed,
                nextStatus
            );
            setStaffStatistics((prev) => ({
                ...prev,
                stockStatus: nextStatus,
            }));
        } catch (err) {
            console.error('Error toggling stock status:', err);
        } finally {
            setUpdatingStockStatus(false);
        }
    };

    // Load last 7 days sales data (now handled by time-based query)

    // Load all chart data
    const loadChartData = useCallback(async () => {
        setChartsLoading(true);
        try {
            await Promise.all([
                loadStockByStall(),
                loadSalesVsExpense(),
                loadBestSellers(),
                loadAvailableStalls(),
                loadTimeBasedSales(),
                loadStallsStatus()
            ]);
        } catch (err) {
            console.error('Error loading chart data:', err);
        } finally {
            setChartsLoading(false);
        }
    }, [
        loadStockByStall,
        loadSalesVsExpense,
        loadBestSellers,
        loadAvailableStalls,
        loadTimeBasedSales,
        loadStallsStatus,
    ]);

    // Refresh all chart data
    // No standalone refresh function; use loadChartData directly in effects

    const donutStockByStall = useMemo(() => ({
        labels: stockByStall.map(stall => stall.stall_name),
        datasets: [
            {
                label: 'Stock Qty',
                data: stockByStall.map(stall => stall.total_stock),
                backgroundColor: ['#fbbf24', '#818cf8', '#f87171', '#34d399', '#f472b6'],
                borderWidth: 0,
            },
        ],
    }), [stockByStall]);

    const donutSalesVsExpense = useMemo(() => ({
        labels: ['Sales', 'Expenses'],
        datasets: [
            {
                label: 'Amount',
                data: [salesVsExpense.sales, salesVsExpense.expenses],
                backgroundColor: ['#22d3ee', '#f97316'],
                borderWidth: 0,
            },
        ],
    }), [salesVsExpense]);

    const donutBestSeller = useMemo(() => ({
        labels: bestSellers.map(item => item.item_name),
        datasets: [
            {
                label: 'Units Sold',
                data: bestSellers.map(item => item.units_sold),
                backgroundColor: ['#86efac', '#93c5fd', '#fda4af', '#fde68a'],
                borderWidth: 0,
            },
        ],
    }), [bestSellers]);

    const timeBasedLine = useMemo(() => {
        // Create complete date range for proper labeling
        let allLabels = [];
        let allData = [];
        
        if (timePeriod === 'yesterday') {
            // Show yesterday in context of last 7 days
            const now = getPHDate();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // Generate last 7 days ending with yesterday
            for (let i = 6; i >= 0; i--) {
                const date = new Date(yesterday);
                date.setDate(date.getDate() - i);
                const dateStr = getPHDateString(date);
                const label = formatPHDate(dateStr, { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric'
                });
                
                allLabels.push(label);
                
                // Find sales data for this day
                const salesData = timeBasedSales.find(item => item.period === dateStr);
                allData.push(salesData ? salesData.sales : 0);
            }
        } else if (timePeriod === 'week') {
            // Generate last 7 days including today
            const now = getPHDate();
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const dateStr = getPHDateString(date);
                const label = formatPHDate(dateStr, { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric'
                });
                
                allLabels.push(label);
                
                // Find sales data for this day
                const salesData = timeBasedSales.find(item => item.period === dateStr);
                allData.push(salesData ? salesData.sales : 0);
            }
        } else if (timePeriod === 'month') {
            // Generate all 12 months
            const now = getPHDate();
            for (let i = 11; i >= 0; i--) {
                const date = new Date(now);
                date.setMonth(date.getMonth() - i);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const periodKey = `${year}-${month}`;
                const label = formatPHDate(getPHDateString(date), { month: 'short', year: 'numeric' });
                
                allLabels.push(label);
                
                // Find sales data for this month
                const salesData = timeBasedSales.find(item => item.period === periodKey);
                allData.push(salesData ? salesData.sales : 0);
            }
        }

        return {
            labels: allLabels,
            datasets: [
                {
                    label: 'Sales (₱)',
                    data: allData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: allData.map((_, index) => {
                        // Highlight the last point (yesterday) if in yesterday view
                        if (timePeriod === 'yesterday' && index === allData.length - 1) {
                            return '#10b981'; // Green color for yesterday
                        }
                        return '#3B82F6';
                    }),
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: allData.map((_, index) => {
                        // Make yesterday's point slightly larger
                        if (timePeriod === 'yesterday' && index === allData.length - 1) {
                            return 8;
                        }
                        return 6;
                    }),
                    pointHoverRadius: 10,
                },
            ],
        };
    }, [timeBasedSales, timePeriod]);

    const donutOptions = useMemo(() => ({
        plugins: {
            legend: { position: 'bottom' },
            title: { display: false },
        },
        cutout: '65%',
        maintainAspectRatio: false,
    }), []);

    const lineOptions = useMemo(() => ({
        responsive: true,
        plugins: {
            legend: { 
                display: true,
                position: 'top',
                labels: {
                    color: '#374151',
                    font: { size: 12 }
                }
            },
            title: { display: false },
            tooltip: { 
                mode: 'index', 
                intersect: false,
                backgroundColor: '#1F2937',
                titleColor: '#F9FAFB',
                bodyColor: '#F9FAFB',
                borderColor: '#374151',
                borderWidth: 1,
                callbacks: {
                    label: function(context) {
                        return `Sales: ₱${Number(context.parsed.y).toLocaleString()}`;
                    }
                }
            },
        },
        scales: {
            x: { 
                grid: { color: 'rgba(55, 65, 81, 0.1)' },
                ticks: { color: '#6B7280' }
            },
            y: { 
                grid: { color: 'rgba(55, 65, 81, 0.1)' },
                ticks: { 
                    color: '#6B7280',
                    callback: function(value) {
                        return '₱' + Number(value).toLocaleString();
                    }
                },
                beginAtZero: true 
            },
        },
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index'
        }
    }), []);

    // Reload time-based sales when controls change
    useEffect(() => {
        if (userProfile?.role === 'admin') {
            loadTimeBasedSales();
        }
    }, [userProfile?.role, loadTimeBasedSales]);

    // Refresh chart data periodically and on mount for admin
    useEffect(() => {
        if (userProfile?.role !== 'admin') {
            return undefined;
        }

        loadChartData();

        const refreshInterval = setInterval(() => {
            loadChartData();
        }, 30000);

        return () => clearInterval(refreshInterval);
    }, [userProfile?.role, loadChartData]);

    // Load staff dashboard data for staff
    useEffect(() => {
        if (userProfile?.role === 'staff') {
            loadStaffDashboardData();
        }
    }, [userProfile?.role, loadStaffDashboardData]);

    // Set loading state based on profile loading
    useEffect(() => {
        if (!profileLoading) {
            setLoading(false);
        }
    }, [profileLoading]);

    if (loading || profileLoading) {
        return (
            <div className="min-h-screen bg-base-200 flex items-center justify-center">
                <div className="loading loading-spinner loading-lg text-primary"></div>
            </div>
        );
    }

    return (
        <Layout userProfile={userProfile}>
            <div className="container mx-auto p-6">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-primary">
                        {isAdmin(userProfile) ? 'Admin Dashboard' : 'Staff Dashboard'}
                    </h1>
                    {!isAdmin(userProfile) && (
                        <p className="text-sm text-base-content/70">
                            Today • My Stall
                        </p>
                    )}
                </div>

                {isAdmin(userProfile) ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Combined: Sales over time by stall (spans 2 columns) */}
                        <div className="card bg-base-100 shadow-xl lg:col-span-2">
                            <div className="card-body">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="card-title">Sales Summary</h2>
                                    <div className="flex gap-2">
                                        <div className="form-control">
                                            <select
                                                className="select select-bordered select-sm"
                                                value={selectedStall}
                                                onChange={(e) => setSelectedStall(e.target.value)}
                                            >
                                                <option value="all">All Stalls</option>
                                                {availableStalls.map(stall => (
                                                    <option key={stall.stall_id} value={stall.stall_id}>
                                                        {stall.stall_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-control">
                                            <select
                                                className="select select-bordered select-sm"
                                                value={timePeriod}
                                                onChange={(e) => setTimePeriod(e.target.value)}
                                            >
                                                <option value="yesterday">Yesterday</option>
                                                <option value="week">Last 7 Days</option>
                                                <option value="month">Last 12 Months</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="h-80">
                                    {chartsLoading ? (
                                        <div className="flex items-center justify-center h-full">
                                            <div className="loading loading-spinner loading-md text-primary"></div>
                                        </div>
                                    ) : (
                                        <Line data={timeBasedLine} options={lineOptions} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Donut: Stocks per stall */}
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Stocks per Stall</h2>
                                <div className="h-64">
                                    {chartsLoading ? (
                                        <div className="flex items-center justify-center h-full">
                                            <div className="loading loading-spinner loading-md text-primary"></div>
                                        </div>
                                    ) : (
                                        <Doughnut data={donutStockByStall} options={donutOptions} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Donut: Sales vs Expense */}
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Sales vs Expense</h2>
                                <div className="h-64">
                                    {chartsLoading ? (
                                        <div className="flex items-center justify-center h-full">
                                            <div className="loading loading-spinner loading-md text-primary"></div>
                                        </div>
                                    ) : (
                                        <Doughnut data={donutSalesVsExpense} options={donutOptions} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Donut: Best seller */}
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Best Seller</h2>
                                <div className="h-64">
                                    {chartsLoading ? (
                                        <div className="flex items-center justify-center h-full">
                                            <div className="loading loading-spinner loading-md text-primary"></div>
                                        </div>
                                    ) : (
                                        <Doughnut data={donutBestSeller} options={donutOptions} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Business Stalls Statuses */}
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h2 className="card-title">Business Stalls Statuses</h2>
                                {chartsLoading ? (
                                    <div className="flex items-center justify-center h-full py-8">
                                        <div className="loading loading-spinner loading-md text-primary"></div>
                                    </div>
                                ) : stallsStatus.length === 0 ? (
                                    <div className="text-base-content/50 text-center py-4">
                                        No stalls available.
                                    </div>
                                ) : (
                                    <>
                                    {/* Desktop Table View */}
                                    <div className="hidden md:block overflow-x-auto">
                                        <table className="table table-zebra w-full">
                                            <thead>
                                                <tr>
                                                    <th>Stall</th>
                                                    <th>Active Status</th>
                                                    <th>Sold Out Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {stallsStatus.map((stall) => {
                                                    const getBusinessStatusBadgeColor = (status) => {
                                                        switch (status) {
                                                            case 'active':
                                                                return 'badge-success';
                                                            case 'inactive':
                                                                return 'badge-error';
                                                            case 'under maintenance':
                                                                return 'badge-warning';
                                                            default:
                                                                return 'badge-neutral';
                                                        }
                                                    };

                                                    const getStockStatusBadgeColor = (stockStatus) => {
                                                        switch (stockStatus) {
                                                            case 'sold_out':
                                                                return 'badge-success';
                                                            case 'not_sold_out':
                                                            default:
                                                                return 'badge-error';
                                                        }
                                                    };

                                                    const stockStatusLabel =
                                                        stall.stockStatus === 'sold_out'
                                                            ? 'Sold Out'
                                                            : 'Not Sold Out';

                                                    return (
                                                        <tr key={stall.stall_id}>
                                                            <td>
                                                                <div className="font-semibold">
                                                                    {stall.stall_name}
                                                                </div>
                                                                {stall.location && (
                                                                    <div className="text-sm text-base-content/70">
                                                                        {stall.location}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span
                                                                    className={`badge ${getBusinessStatusBadgeColor(
                                                                        stall.status
                                                                    )}`}
                                                                >
                                                                    {stall.status || 'N/A'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span
                                                                    className={`badge badge-sm md:badge-md whitespace-nowrap ${getStockStatusBadgeColor(
                                                                        stall.stockStatus
                                                                    )}`}
                                                                >
                                                                    {stockStatusLabel}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Card View */}
                                    <div className="md:hidden space-y-3">
                                        {stallsStatus.map((stall) => {
                                            const getBusinessStatusBadgeColor = (status) => {
                                                switch (status) {
                                                    case 'active':
                                                        return 'badge-success';
                                                    case 'inactive':
                                                        return 'badge-error';
                                                    case 'under maintenance':
                                                        return 'badge-warning';
                                                    default:
                                                        return 'badge-neutral';
                                                }
                                            };

                                            const getStockStatusBadgeColor = (stockStatus) => {
                                                switch (stockStatus) {
                                                    case 'sold_out':
                                                        return 'badge-success';
                                                    case 'not_sold_out':
                                                    default:
                                                        return 'badge-error';
                                                }
                                            };

                                            const stockStatusLabel =
                                                stall.stockStatus === 'sold_out'
                                                    ? 'Sold Out'
                                                    : 'Not Sold Out';

                                            return (
                                                <div key={stall.stall_id} className="card bg-base-200 shadow-sm">
                                                    <div className="card-body p-3">
                                                        <div className="mb-2">
                                                            <p className="font-semibold text-sm">{stall.stall_name}</p>
                                                            {stall.location && (
                                                                <p className="text-xs text-base-content/70">{stall.location}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-2 flex-wrap">
                                                            <span className={`badge badge-sm ${getBusinessStatusBadgeColor(stall.status)}`}>
                                                                {stall.status || 'N/A'}
                                                            </span>
                                                            <span className={`badge badge-sm whitespace-nowrap ${getStockStatusBadgeColor(stall.stockStatus)}`}>
                                                                {stockStatusLabel}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    </>
                                )}
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Staff: Recent Transactions (Today, My Stall) */}
                    <div className="card bg-base-100 shadow-xl">
                        <div className="card-body">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="card-title text-secondary">Today&apos;s Recent Transactions</h2>
                                </div>
                                {staffCardsLoading ? (
                                    <div className="flex items-center justify-center h-48">
                                        <div className="loading loading-spinner loading-md text-primary"></div>
                                    </div>
                                ) : staffTransactions.length === 0 ? (
                                    <div className="text-center text-base-content/50 py-6">
                                        No transactions recorded yet for today.
                                    </div>
                                ) : (
                                    <>
                                    {/* Desktop Table View */}
                                    <div className="hidden md:block overflow-x-auto max-h-80">
                                        <table className="table table-zebra w-full">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Item</th>
                                                    <th>Qty</th>
                                                    <th>Amount</th>
                                                    <th>Payment</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {staffTransactions.map((tx) => (
                                                    <tr key={tx.sale_id}>
                                                        <td>{tx.sale_date}</td>
                                                        <td>{tx.menu_items?.item_name || 'N/A'}</td>
                                                        <td>{tx.quantity_sold}</td>
                                                        <td className="text-success font-semibold">
                                                            ₱{Number(tx.total_amount || 0).toFixed(2)}
                                                        </td>
                                                        <td>
                                                            <span className={`badge ${tx.payment_method === 'cash' ? 'badge-primary' : 'badge-secondary'}`}>
                                                                {tx.payment_method}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Card View */}
                                    <div className="md:hidden space-y-3 max-h-80 overflow-y-auto">
                                        {staffTransactions.map((tx) => (
                                            <div key={tx.sale_id} className="card bg-base-200 shadow-sm">
                                                <div className="card-body p-3">
                                                    {/* Name Header Section */}
                                                    <div className="mb-3">
                                                        <p className="font-semibold text-sm mb-1">{tx.menu_items?.item_name || 'N/A'}</p>
                                                        <p className="text-xs text-base-content/70">{tx.sale_date}</p>
                                                    </div>
                                                    
                                                    {/* Price Section with Divider */}
                                                    <div className="mb-3 pb-2 border-b border-base-300">
                                                        <p className="text-success font-bold text-xl">₱{Number(tx.total_amount || 0).toFixed(2)}</p>
                                                    </div>
                                                    
                                                    {/* Details Grid */}
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div className="flex justify-end items-center">
                                                            <span className="text-base-content/70">Qty: </span>
                                                            <span className="font-medium">{tx.quantity_sold}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-base-content/70">Payment: </span>
                                                            <span className={`badge badge-sm ${tx.payment_method === 'cash' ? 'badge-primary' : 'badge-secondary'}`}>
                                                                {tx.payment_method}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Staff: Key Statistics (Today, My Stall) */}
                        <div className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="card-title text-accent">Today&apos;s Key Statistics</h2>
                                </div>
                                {staffCardsLoading ? (
                                    <div className="flex items-center justify-center h-48">
                                        <div className="loading loading-spinner loading-md text-primary"></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="stat">
                                            <div className="stat-title">Stock Distributed</div>
                                            <div className="stat-value text-success">
                                                {staffStatistics.stockDistributed.toFixed(2)} kg
                                            </div>
                                        </div>
                                        <div className="stat">
                                            <div className="stat-title">Sales</div>
                                            <div className="stat-value text-primary">
                                                ₱{staffStatistics.totalSales.toFixed(2)}
                                            </div>
                                        </div>
                                            <div className="stat">
                                                <div className="stat-title">Stock Status</div>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={handleToggleStockStatus}
                                                        disabled={updatingStockStatus}
                                                    >
                                                        <span
                                                            className={`badge badge-sm md:badge-lg whitespace-nowrap ${
                                                                staffStatistics.stockStatus === 'sold_out'
                                                                    ? 'badge-success'
                                                                    : 'badge-error'
                                                            }`}
                                                        >
                                                            {staffStatistics.stockStatus === 'sold_out'
                                                                ? 'Sold Out'
                                                                : 'Not Sold Out'}
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}

export default Dashboard;
