import type { EnvVar } from '@shared/types'
import type { ReactNode } from 'react'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Flex, Input } from 'antd'
import { useTranslation } from 'react-i18next'

interface Props {
  value?: EnvVar[]
  onChange?: (value: EnvVar[]) => void
  keyPlaceholder?: string
}

/** Editable list of KEY=value pairs, usable as an antd Form control */
export default function EnvEditor({ value = [], onChange, keyPlaceholder }: Props): ReactNode {
  const { t } = useTranslation()

  const patch = (index: number, item: Partial<EnvVar>): void =>
    onChange?.(value.map((entry, i) => (i === index ? { ...entry, ...item } : entry)))

  return (
    <Flex vertical gap={8}>
      {value.map((entry, index) => (
        // eslint-disable-next-line react/no-array-index-key -- rows have no stable identity while typing
        <Flex key={index} gap={8}>
          <Input
            style={{ width: '40%' }}
            value={entry.key}
            placeholder={keyPlaceholder ?? t('env.key')}
            onChange={event => patch(index, { key: event.target.value })}
          />
          <Input
            value={entry.value}
            placeholder={t('env.value')}
            onChange={event => patch(index, { value: event.target.value })}
          />
          <Button
            type="text"
            icon={<DeleteOutlined />}
            onClick={() => onChange?.(value.filter((_, i) => i !== index))}
          />
        </Flex>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...value, { key: '', value: '' }])}>
        {t('env.add')}
      </Button>
    </Flex>
  )
}
