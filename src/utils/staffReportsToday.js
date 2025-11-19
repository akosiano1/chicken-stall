import { getPHDate, getPHDateString } from './dateUtils';
import { supabase } from '../supabaseClient';

/**
 * Build start/end date strings for \"today\" in PH timezone.
 */
export function buildTodayRangePH() {
  const today = getPHDate();
  const dateStr = getPHDateString(today);
  return {
    startDate: dateStr,
    endDate: dateStr,
  };
}

/**
 * Apply staff-specific filter to restrict a Supabase query to:
 * - the staff member's assigned stall
 * - records for today only (based on a date column)
 *
 * This is a pure helper that returns the modified query so it can be reused
 * across dashboard and reports without duplicating filter logic.
 */
export function restrictToStaffStallAndToday(query, userProfile, options = {}) {
  if (!userProfile || userProfile.role !== 'staff' || !userProfile.stall_id) {
    return query;
  }

  const { dateColumn } = options;
  const { startDate, endDate } = buildTodayRangePH();

  let restricted = query.eq('stall_id', userProfile.stall_id);

  if (dateColumn) {
    restricted = restricted
      .gte(dateColumn, startDate)
      .lte(dateColumn, endDate);
  }

  return restricted;
}

/**
 * Fetch current stall stock level for a staff user's assigned stall.
 * Reads from the same `stall_stocks` table managed in admin inventory.
 */
export async function fetchCurrentStallStockForStaff(userProfile) {
  if (!userProfile?.stall_id) return 0;

  try {
    const { data, error } = await supabase
      .from('stall_stocks')
      .select('quantity')
      .eq('stall_id', userProfile.stall_id)
      .single();

    if (error) throw error;
    return Number(data?.quantity || 0);
  } catch (err) {
    console.error('Error fetching current stall stock for staff:', err);
    return 0;
  }
}

/**
 * Fetch today's stock status entry for a stall from `stock_status_history`.
 * Returns a normalized object with defaults when no entry exists.
 */
export async function fetchTodayStockStatus(stallId) {
  if (!stallId) {
    return {
      stockLevel: null,
      stockStatus: 'not_sold_out',
    };
  }

  const { startDate } = buildTodayRangePH();

  try {
    const { data, error } = await supabase
      .from('stock_status_history')
      .select('stock_level, stock_status')
      .eq('stall_id', stallId)
      .eq('date', startDate)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return {
        stockLevel: null,
        stockStatus: 'not_sold_out',
      };
    }

    return {
      stockLevel: typeof data.stock_level === 'number' ? data.stock_level : Number(data.stock_level || 0),
      stockStatus: data.stock_status || 'not_sold_out',
    };
  } catch (err) {
    console.error('Error fetching today stock status:', err);
    return {
      stockLevel: null,
      stockStatus: 'not_sold_out',
    };
  }
}

/**
 * Upsert today's stock status entry for a stall into `stock_status_history`.
 * Uses (stall_id, date) as a logical unique key for idempotent updates.
 */
export async function saveTodayStockStatus(stallId, stockLevel, stockStatus) {
  if (!stallId) return;

  const { startDate } = buildTodayRangePH();

  const payload = {
    stall_id: stallId,
    stock_level: Number.isFinite(Number(stockLevel)) ? Number(stockLevel) : null,
    stock_status: stockStatus,
    date: startDate,
  };

  try {
    const { error } = await supabase
      .from('stock_status_history')
      .upsert(payload, { onConflict: 'stall_id,date' });

    if (error) throw error;
  } catch (err) {
    console.error('Error saving today stock status:', err);
  }
}

/**
 * Fetch today's total sales for a staff user's assigned stall.
 */
export async function fetchTodaySalesTotalForStaff(userProfile) {
  if (!userProfile?.stall_id) return 0;

  try {
    let query = supabase
      .from('sales')
      .select('total_amount');

    query = restrictToStaffStallAndToday(query, userProfile, { dateColumn: 'sale_date' });

    const { data, error } = await query;
    if (error) throw error;

    return data?.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) || 0;
  } catch (err) {
    console.error('Error fetching today sales total for staff:', err);
    return 0;
  }
}
