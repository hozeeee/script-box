import MainLayout from '@renderer/layouts/MainLayout'
import SpaceEditorPage from '@renderer/pages/editor/SpaceEditorPage'
import RuntimesPage from '@renderer/pages/runtimes/RuntimesPage'
import SettingsPage from '@renderer/pages/settings/SettingsPage'
import SpacesPage from '@renderer/pages/spaces/SpacesPage'
import { createHashRouter, Navigate } from 'react-router'

export const router = createHashRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/spaces/node" replace /> },
      { path: 'spaces', element: <Navigate to="/spaces/node" replace /> },
      // Static segments outrank `:spaceId`, and space ids are UUIDs, so these never collide
      { path: 'spaces/node', element: <SpacesPage key="node" kind="node" /> },
      { path: 'spaces/python', element: <SpacesPage key="python" kind="python" /> },
      { path: 'spaces/:spaceId', element: <SpaceEditorPage /> },
      { path: 'runtimes', element: <RuntimesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/spaces/node" replace /> },
    ],
  },
])
