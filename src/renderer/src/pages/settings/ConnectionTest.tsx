import type { ConnectionTestResult } from '@shared/types'
import type { ReactNode } from 'react'
import { ApiOutlined } from '@ant-design/icons'
import { invoke } from '@renderer/api'
import { formatError } from '@renderer/api/errors'
import { Button, Space, Tag, Tooltip } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Fetches the saved npm registry through the saved proxy settings and reports latency */
export default function ConnectionTest({ registry }: { registry: string }): ReactNode {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ConnectionTestResult | null>(null)

  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await invoke('settings:test-connection', registry))
    }
    catch (error) {
      setResult({ ok: false, elapsed: 0, error: formatError(t, error) })
    }
    finally {
      setTesting(false)
    }
  }

  return (
    <Space>
      <Tooltip title={t('settings.testHint', { url: registry })}>
        <Button icon={<ApiOutlined />} loading={testing} onClick={() => void test()}>
          {t('settings.testConnection')}
        </Button>
      </Tooltip>
      {result && (result.ok
        ? <Tag color="success">{t('settings.testOk', { elapsed: result.elapsed, status: result.status })}</Tag>
        : (
            <Tooltip title={result.error}>
              <Tag color="error">{t('settings.testFailed', { status: result.status ?? '-' })}</Tag>
            </Tooltip>
          ))}
    </Space>
  )
}
