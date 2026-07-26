import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureSeedCurrent } from './data/repo.ts'

async function bootstrap() {
  // P0: request durable storage immediately
  let storageGranted = false
  if (navigator.storage?.persist) {
    storageGranted = await navigator.storage.persist()
  }

  try {
    await ensureSeedCurrent()
  } catch (err) {
    console.error('Seed failed:', err)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App storageGranted={storageGranted} />
    </StrictMode>,
  )
}

bootstrap()
