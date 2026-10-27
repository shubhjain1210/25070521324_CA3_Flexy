import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{Toaster}from'react-hot-toast';import App from'./App.jsx';import'./styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App/><Toaster position="bottom-right"/></BrowserRouter></React.StrictMode>);
