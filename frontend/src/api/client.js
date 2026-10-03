import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally - redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Creates a mutating request with an idempotency key.
 * The key is stable for the lifetime of the request object,
 * so retries use the same key and get the cached response.
 */
export const withIdempotencyKey = (config) => ({
  ...config,
  headers: {
    ...config.headers,
    'Idempotency-Key': uuidv4(),
  },
});

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

// ─── Work Items ───────────────────────────────────────────────────────────────

export const workItemsApi = {
  list: (params) => api.get('/work-items', { params }),
  get: (id) => api.get(`/work-items/${id}`),
  create: (data) => api.post('/work-items', data, withIdempotencyKey({})),
  update: (id, data) => api.patch(`/work-items/${id}`, data, withIdempotencyKey({})),
  updateStatus: (id, data) => api.post(`/work-items/${id}/status`, data, withIdempotencyKey({})),
  claim: (id, data) => api.post(`/work-items/${id}/claim`, data, withIdempotencyKey({})),
  approve: (id, data) => api.post(`/work-items/${id}/approve`, data, withIdempotencyKey({})),
  delete: (id) => api.delete(`/work-items/${id}`),
};

// ─── Comments ─────────────────────────────────────────────────────────────────

export const commentsApi = {
  create: (workItemId, data) => api.post(`/work-items/${workItemId}/comments`, data),
  update: (workItemId, commentId, data) => api.patch(`/work-items/${workItemId}/comments/${commentId}`, data),
  delete: (workItemId, commentId) => api.delete(`/work-items/${workItemId}/comments/${commentId}`),
};

// ─── Teams ────────────────────────────────────────────────────────────────────

export const teamsApi = {
  list: () => api.get('/teams'),
  members: (teamId) => api.get(`/teams/${teamId}/members`),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  get: () => api.get('/dashboard'),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  search: (q) => api.get('/users/search', { params: { q } }),
};
