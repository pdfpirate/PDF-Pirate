import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Bundled signature-style fonts (offline, identical on Win + Mac).
import '@fontsource/dancing-script/400.css'
import '@fontsource/great-vibes/400.css'
import '@fontsource/sacramento/400.css'
import '@fontsource/caveat/400.css'
import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
