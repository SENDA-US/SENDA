export const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  console.warn('VITE_API_URL no está definida en el entorno. Usando valor por defecto.');
}

export default {
  API_URL: API_URL || 'http://localhost:1574',
};