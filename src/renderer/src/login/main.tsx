import React from 'react'
import ReactDOM from 'react-dom/client'
import { LoginApp } from './LoginApp'
import '../styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LoginApp />
  </React.StrictMode>
)
