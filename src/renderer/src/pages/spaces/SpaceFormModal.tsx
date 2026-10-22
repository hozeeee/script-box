import type { InstalledRuntime, ProjectInfo, RuntimeKind, Space, SpaceInput } from '@shared/types'
import type { ReactNode } from 'react'
import { FolderOpenOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import NodeVersionSelect from '@renderer/components/runtime/NodeVersionSelect'
import { useRuntimesStore } from '@renderer/stores/runtimes'
import { useSettingsStore } from '@renderer/stores/settings'
import { useSpacesStore } from '@renderer/stores/spaces'
import { Alert, Space as AntSpace, App, Button, Form, Input, Modal } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** A project directory picked for import, already inspected by the main process */
export interface PickedProject {
  path: string
  info: ProjectInfo
}

interface Props {
  open: boolean
  /** Edit this space, or create a new one when omitted */
  space?: Space
  /** Import this project instead of creating an empty space */
  project?: PickedProject
  /** Runtime language for new spaces / import */
  runtimeKind?: RuntimeKind
  onClose: () => void
  onSaved?: (space: Space) => void
}

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

const plain = (version: string): string => version.replace(/^v/, '')

/** Installed runtime matching a `.nvmrc` style hint (`v22.11.0` exactly, or the newest `22.x`) */
function matchRuntime(hint: string | null, installed: InstalledRuntime[]): string | null {
  if (!hint)
    return null
  const exact = installed.find(item => plain(item.version) === plain(hint))
  if (exact)
    return exact.version
  if (!/^\d+$/.test(hint))
    return null
  const candidates = installed
    .filter(item => plain(item.version).split('.')[0] === hint)
    .sort((a, b) => plain(b.version).localeCompare(plain(a.version), undefined, { numeric: true }))
  return candidates[0]?.version ?? null
}

export default function SpaceFormModal({ open, space, project, runtimeKind: kindProp, onClose, onSaved }: Props): ReactNode {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [form] = Form.useForm<SpaceInput>()
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const { create, importProject, update } = useSpacesStore()
  const installed = useRuntimesStore(state => state.installed)
  const settings = useSettingsStore(state => state.settings)
  const isProject = !!project || !!space?.projectPath

  const kind: RuntimeKind = space ? space.runtime.kind : kindProp ?? 'node'
  const isPython = kind === 'python'
  const nodeInstalled = installed.filter(i => i.kind === 'node')
  const pythonInstalled = installed.filter(i => i.kind === 'python')
  const defaultNodeVersion = settings?.run.defaultNodeVersion ?? nodeInstalled[0]?.version ?? null
  const defaultPythonVersion = settings?.run.defaultPythonVersion ?? pythonInstalled[0]?.version ?? null
  const fallbackVersion = isPython ? defaultPythonVersion : defaultNodeVersion

  // The modal body mounts lazily (and is destroyed on close), so values set from an effect
  // can land before the Form is connected and get lost. Seed them via initialValues instead,
  // which are applied every time the Form mounts.
  const initialValues: SpaceInput = space
    ? { name: space.name, description: space.description, runtime: space.runtime, projectPath: space.projectPath }
    : project
      ? {
          name: (project.info.packageName ?? baseName(project.path)).slice(0, 64),
          description: '',
          runtime: {
            kind,
            version: isPython
              ? matchRuntime(project.info.pythonVersionHint ?? null, pythonInstalled) ?? fallbackVersion
              : matchRuntime(project.info.nodeVersionHint, nodeInstalled) ?? fallbackVersion,
          },
          projectPath: project.path,
          pythonManager: isPython ? project.info.pythonManager : undefined,
          pythonVersionSource: isPython ? project.info.pythonVersionSource : undefined,
        }
      : { name: '', description: '', runtime: { kind, version: fallbackVersion } }

  /** Re-link a project space after its directory was moved */
  const pickDirectory = async (): Promise<void> => {
    setPicking(true)
    try {
      const path = await invoke('app:select-directory')
      if (!path)
        return
      await invoke('space:inspect-project', path)
      form.setFieldValue('projectPath', path)
    }
    catch (error) {
      message.error(formatError(t, error))
    }
    finally {
      setPicking(false)
    }
  }

  const submit = async (): Promise<void> => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const saved = space
        ? await update(space.id, values)
        : project
          ? await importProject({ ...values, projectPath: project.path })
          : await create(values)
      onSaved?.(saved)
      onClose()
    }
    catch (error) {
      message.error(formatError(t, error))
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={space ? t('spaces.edit') : project ? t('spaces.importProject') : t('spaces.create')}
      confirmLoading={saving}
      onOk={() => void submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        {isProject && (
          <Form.Item label={t('spaces.projectPath')} extra={t('spaces.projectPathHint')} required>
            <AntSpace.Compact block>
              <Form.Item name="projectPath" noStyle rules={[{ required: true }]}>
                <Input readOnly />
              </Form.Item>
              {space && (
                <Button icon={<FolderOpenOutlined />} loading={picking} onClick={() => void pickDirectory()}>
                  {t('spaces.relink')}
                </Button>
              )}
            </AntSpace.Compact>
          </Form.Item>
        )}
        {project?.info.pnp && (
          <Form.Item>
            <Alert type="warning" showIcon message={t('spaces.pnpWarning')} />
          </Form.Item>
        )}
        <Form.Item name="name" label={t('common.name')} rules={[{ required: true, whitespace: true, max: 64 }]}>
          <Input placeholder={t('spaces.namePlaceholder')} autoFocus />
        </Form.Item>
        <Form.Item name="description" label={t('common.description')}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} />
        </Form.Item>
        <Form.Item
          name={['runtime', 'version']}
          label={isPython ? t('spaces.pythonVersion') : t('spaces.nodeVersion')}
          extra={isPython
            ? (project?.info.pythonVersionHint
                ? t('spaces.pythonVersionDetected', { version: project.info.pythonVersionHint })
                : t('spaces.pythonVersionHint'))
            : (project?.info.nodeVersionHint
                ? t('spaces.nodeVersionDetected', { version: project.info.nodeVersionHint })
                : t('spaces.nodeVersionHint'))}
        >
          <NodeVersionSelect kind={kind} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
