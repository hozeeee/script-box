import type { MenuProps } from 'antd'
import type { ReactNode } from 'react'
import { JavaScriptOutlined, NodeIndexOutlined, PythonOutlined, SettingOutlined } from '@ant-design/icons'
import UpdateNotifier from '@renderer/components/common/UpdateNotifier'
import { useSpacesStore } from '@renderer/stores/spaces'
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
  const spaces = useSpacesStore(state => state.spaces)
  const [, section, child] = location.pathname.split('/')
  // Inside a space editor, highlight the list the space belongs to
  const selected = section === 'spaces'
    ? `/spaces/${child === 'python' || child === 'node' ? child : spaces.find(space => space.id === child)?.runtime?.kind ?? 'node'}`
    : `/${section ?? ''}`

  const items: MenuProps['items'] = [
    { key: '/spaces/node', icon: <JavaScriptOutlined />, label: t('nav.nodeSpaces') },
    { key: '/spaces/python', icon: <PythonOutlined />, label: t('nav.pythonSpaces') },
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
