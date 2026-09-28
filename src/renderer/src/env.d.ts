import type { GuguApi } from '../../preload/index'

declare global {
  interface Window {
    gugu: GuguApi
  }
}

export {}
