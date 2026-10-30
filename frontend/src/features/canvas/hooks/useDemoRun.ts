import { useCallback, useEffect, useRef, useState } from 'react'
import { createDemoFrames, stopDemoFrame } from '../demoPlayback'
import type { DemoRunFrame, DemoScenario } from '../types'

type Playback = { frames: DemoRunFrame[]; index: number; runNumber: number; scenarioLabel: string }

export function useDemoRun(stepIds: string[]) {
  const [playback, setPlayback] = useState<Playback | null>(null)
  const runCount = useRef(0)
  const frame = playback?.frames[playback.index] ?? null
  const running = frame?.status === 'running'

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => setPlayback((current) => current
      ? { ...current, index: Math.min(current.index + 1, current.frames.length - 1) }
      : current), 550)
    return () => window.clearTimeout(timer)
  }, [playback, running])

  function start(scenario: DemoScenario) {
    if (running) return
    const frames = createDemoFrames(stepIds, scenario)
    runCount.current += 1
    setPlayback({ frames, index: 0, runNumber: runCount.current, scenarioLabel: scenario.label })
  }

  const stop = useCallback(() => {
    setPlayback((current) => current?.frames[current.index].status === 'running' ? {
      ...current, frames: [stopDemoFrame(current.frames[current.index])], index: 0,
    } : current)
  }, [])

  function resume(frames: DemoRunFrame[]) {
    if (frames.length === 0) return
    setPlayback((current) => current?.frames[current.index].status === 'failed'
      ? { ...current, frames, index: 0, scenarioLabel: 'Resumed execution' } : current)
  }

  return { frame, running, start, stop, resume, scenarioLabel: playback?.scenarioLabel,
    runId: playback ? `run-${String(playback.runNumber).padStart(3, '0')}` : null }
}
