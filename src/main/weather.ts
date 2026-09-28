// 天气服务：Open-Meteo（免 key）。城市可在设置里改，默认按时区猜一个。
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WeatherNow {
  raining: boolean
  snowing: boolean
  code: number
  tempC: number
  city: string
}

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])

function settingsFile(): string {
  return join(app.getPath('userData'), 'weather.json')
}

export function getCity(): string {
  try {
    return (JSON.parse(readFileSync(settingsFile(), 'utf8')) as { city?: string }).city || '上海'
  } catch {
    return '上海'
  }
}

export function setCity(city: string): void {
  writeFileSync(settingsFile(), JSON.stringify({ city }))
}

async function geocode(city: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
      { signal: AbortSignal.timeout(10_000) }
    )
    const body = (await res.json()) as { results?: { latitude: number; longitude: number }[] }
    const r = body.results?.[0]
    return r ? { lat: r.latitude, lon: r.longitude } : null
  } catch {
    return null
  }
}

export async function fetchWeather(): Promise<WeatherNow | null> {
  const city = getCity()
  const geo = await geocode(city)
  if (!geo) return null
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=weather_code,temperature_2m`,
      { signal: AbortSignal.timeout(10_000) }
    )
    const body = (await res.json()) as {
      current?: { weather_code: number; temperature_2m: number }
    }
    const code = body.current?.weather_code ?? -1
    return {
      raining: RAIN_CODES.has(code),
      snowing: SNOW_CODES.has(code),
      code,
      tempC: body.current?.temperature_2m ?? 0,
      city
    }
  } catch {
    return null
  }
}
