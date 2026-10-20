import type { ReactNode } from 'react'
import { useDepsStore } from '@renderer/stores/deps'
import { useRunsStore } from '@renderer/stores/runs'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { useSettingsStore } from '@renderer/stores/settings'
import { useSpacesStore } from '@renderer/stores/spaces'
import { Spin } from 'antd'
import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'
import { Providers } from './providers'
import { router } from './router'

export default function App(): ReactNode {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void Promise.allSettled([
      useSettingsStore.getState().load(),
      useSpacesStore.getState().load(),
      useRuntimesStore.getState().loadInstalled(),
      useRunsStore.getState().sync(),
      useDepsStore.getState().sync(),
    ]).then(() => setReady(true))
  }, [])

  return (
    <Providers>
      {ready
        ? <RouterProvider router={router} />
        : <div className="app-loading"><Spin size="large" /></div>}
    </Providers>
  )
}
