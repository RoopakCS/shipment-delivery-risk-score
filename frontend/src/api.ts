import axios from 'axios';

export const API_URL = 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_URL,
});

export const getHealth = async () => {
  const { data } = await apiClient.get('/health');
  return data;
};
