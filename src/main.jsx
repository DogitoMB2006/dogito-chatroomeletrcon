import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.jsx';

// Verificar si estamos ejecutando en Electron
window.isElectron = window && window.electronAPI;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

// Notificar cuando la aplicación está lista (para Electron)
if (window.isElectron) {
  window.addEventListener('DOMContentLoaded', () => {
    console.log('La aplicación web se ha cargado en Electron');
  });
}