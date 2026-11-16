import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrandingProvider } from './context/BrandingContext';
import { applyBrandToDocument, loadStoredBrand } from './config/branding';
import './index.css';

applyBrandToDocument(loadStoredBrand());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrandingProvider>
      <App />
    </BrandingProvider>
  </React.StrictMode>
);
