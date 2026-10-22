import type { MenuProps } from 'antd'
import type { ReactNode } from 'react'
import { AppstoreOutlined, NodeIndexOutlined, SettingOutlined } from '@ant-design/icons'
import UpdateNotifier from '@renderer/components/common/UpdateNotifier'
import { Layout, Menu, theme, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router'
import logo from '../../../../resources/icon.png'

const { Sider, Content } = Layout

export default function MainLayout(): ReactNode {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const selected = `/${location.pathname.split('/')[1] ?? 'spaces'}`

  const items: MenuProps['items'] = [
    { key: '/spaces', icon: <AppstoreOutlined />, label: t('nav.spaces') },
    { key: '/runtimes', icon: <NodeIndexOutlined />, label: t('nav.runtimes') },
    { key: '/settings', icon: <SettingOutlined />, label: t('nav.settings') },
  ]

  return (
    <Layout className="fill">
      <Sider
        width={180}
        theme="light"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px' }}>
          <img src={logo} width={24} height={24} alt="" />
          <Typography.Text strong style={{ fontSize: 16 }}>Script Box</Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={items}
          style={{ borderInlineEnd: 'none' }}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Content className="fill" style={{ background: token.colorBgContainer }}>
        <Outlet />
      </Content>
      <UpdateNotifier />
    </Layout>
  )
}
