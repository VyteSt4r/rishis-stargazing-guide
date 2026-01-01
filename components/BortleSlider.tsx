'use client'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'stargazer.bortleScale'

export default function BortleSlider() {
  const [value, setValue] = useState(6)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? Number(raw) : NaN
      if (Number.isFinite(parsed)) {
        setValue(Math.max(1, Math.min(9, Math.round(parsed))))
      }
    } catch {
      // ignore
    }
  }, [])

  const update = (next: number) => {
    const clamped = Math.max(1, Math.min(9, Math.round(next)))
    setValue(clamped)
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped))
      window.dispatchEvent(new CustomEvent('stargazer:bortleScale', { detail: clamped }))
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm">Urban</span>
        <span className="text-sm">Wilderness</span>
      </div>
      <motion.input
        type="range"
        min={1}
        max={9}
        value={value}
        onChange={(e) => update(Number(e.target.value))}
        whileTap={{ scale: 0.98 }}
        className="w-full"
      />
      <div className="mt-2 text-sm">Bortle: {value}</div>
    </div>
  )
}
