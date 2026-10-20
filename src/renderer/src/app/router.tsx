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
      { index: true, element: <Navigate to="/spaces" replace /> },
      { path: 'spaces', element: <SpacesPage /> },
      { path: 'spaces/:spaceId', element: <SpaceEditorPage /> },
      { path: 'runtimes', element: <RuntimesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/spaces" replace /> },
    ],
  },
])
