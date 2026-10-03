import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns';

export const PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_approval: 'Pending Approval',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const CATEGORY_LABELS = {
  customer_issue: 'Customer Issue',
  engineering: 'Engineering',
  payment: 'Payment',
  production_incident: 'Production Incident',
  compliance: 'Compliance',
  operational: 'Operational',
  general: 'General',
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    if (!isValid(d)) return '—';
    return format(d, 'MMM d, yyyy');
  } catch { return '—'; }
};

export const formatRelative = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    if (!isValid(d)) return '—';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch { return '—'; }
};

export const getInitials = (name = '') => {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
};

export const getApiError = (err) => {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.message) return err.message;
  return 'Something went wrong';
};

export const VALID_TRANSITIONS = {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'pending_approval', 'resolved', 'closed'],
  pending_approval: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};
