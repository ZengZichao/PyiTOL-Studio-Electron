/**
 * Application menu — shortcuts and commands.
 * All commands are forwarded to the renderer via sendMenuCommand().
 * Menu labels are localized based on the saved language preference.
 */

import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { sendMenuCommand } from './index'
import { store } from './store'
import { applyTheme } from './index'
import type { MenuCommand } from '@shared/types'

function isZh(): boolean {
  return store.get<string>('ui/language', 'en') === 'zh'
}

function command(id: MenuCommand, label: string, accelerator?: string): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => sendMenuCommand(id)
  }
}

export function buildMenu(): Menu {
  const zh = isZh()
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = [
    {
      label: zh ? '文件' : 'File',
      submenu: [
        command('new-project', zh ? '新建工程' : 'New Project', 'CmdOrCtrl+N'),
        command('open-project', zh ? '打开工程…' : 'Open Project…', 'CmdOrCtrl+O'),
        command('save-project', zh ? '保存工程' : 'Save Project', 'CmdOrCtrl+S'),
        command('save-project-as', zh ? '另存为…' : 'Save Project As…', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        command('open-wizard', zh ? '模板向导…' : 'Template Wizard…', 'CmdOrCtrl+Alt+W'),
        command('import-template', zh ? '导入模板…' : 'Import Template…', 'CmdOrCtrl+I'),
        { type: 'separator' },
        command('open-example', zh ? '打开示例工程' : 'Open Example Project', 'CmdOrCtrl+Shift+E')
      ]
    },
    {
      label: zh ? '编辑' : 'Edit',
      submenu: [
        { role: 'undo', label: zh ? '撤销' : 'Undo' },
        { role: 'redo', label: zh ? '重做' : 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: zh ? '剪切' : 'Cut' },
        { role: 'copy', label: zh ? '复制' : 'Copy' },
        { role: 'paste', label: zh ? '粘贴' : 'Paste' },
        { role: 'selectAll', label: zh ? '全选' : 'Select All' }
      ]
    },
    {
      label: zh ? '视图' : 'View',
      submenu: [
        command('toggle-rail', zh ? '切换左栏' : 'Toggle Left Rail', 'CmdOrCtrl+B'),
        command('toggle-inspector', zh ? '切换检查器' : 'Toggle Inspector', 'CmdOrCtrl+J'),
        { type: 'separator' },
        {
          label: zh ? '外观' : 'Appearance',
          submenu: [
            {
              label: zh ? '浅色' : 'Light',
              type: 'radio',
              checked: store.get<string>('ui/theme', 'system') === 'light',
              click: () => {
                store.set('ui/theme', 'light')
                applyTheme('light')
                sendMenuCommand('toggle-theme')
                rebuildMenu()
              }
            },
            {
              label: zh ? '深色' : 'Dark',
              type: 'radio',
              checked: store.get<string>('ui/theme', 'system') === 'dark',
              click: () => {
                store.set('ui/theme', 'dark')
                applyTheme('dark')
                sendMenuCommand('toggle-theme')
                rebuildMenu()
              }
            },
            {
              label: zh ? '跟随系统' : 'Follow System',
              type: 'radio',
              checked: store.get<string>('ui/theme', 'system') === 'system',
              click: () => {
                store.set('ui/theme', 'system')
                applyTheme('system')
                sendMenuCommand('toggle-theme')
                rebuildMenu()
              }
            }
          ]
        },
        {
          label: zh ? '语言' : 'Language',
          submenu: [
            {
              label: 'English',
              type: 'radio',
              checked: store.get<string>('ui/language', 'en') === 'en',
              click: () => {
                store.set('ui/language', 'en')
                sendMenuCommand('switch-language')
                rebuildMenu()
              }
            },
            {
              label: '中文',
              type: 'radio',
              checked: store.get<string>('ui/language', 'en') === 'zh',
              click: () => {
                store.set('ui/language', 'zh')
                sendMenuCommand('switch-language')
                rebuildMenu()
              }
            }
          ]
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: zh ? '开发者工具' : 'Developer Tools', visible: isDev },
        { type: 'separator' },
        { role: 'resetZoom', label: zh ? '重置缩放' : 'Actual Size' },
        { role: 'zoomIn', label: zh ? '放大' : 'Zoom In' },
        { role: 'zoomOut', label: zh ? '缩小' : 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: zh ? '全屏' : 'Enter Full Screen' }
      ]
    },
    {
      label: zh ? '命令' : 'Command',
      submenu: [
        command('open-command-palette', zh ? '命令面板…' : 'Command Palette…', 'CmdOrCtrl+K'),
        command('generate-preview', zh ? '生成预览' : 'Generate Preview', 'CmdOrCtrl+R'),
        command(
          'export-template',
          zh ? '导出当前模板…' : 'Export Current Template…',
          'CmdOrCtrl+E'
        ),
        command('upload-itol', zh ? '上传到 iTOL…' : 'Upload to iTOL…', 'CmdOrCtrl+U')
      ]
    },
    {
      label: zh ? '窗口' : 'Window',
      submenu: [
        { role: 'minimize', label: zh ? '最小化' : 'Minimize' },
        { role: 'close', label: zh ? '关闭' : 'Close' }
      ]
    },
    {
      label: zh ? '帮助' : 'Help',
      submenu: [
        command('show-about', zh ? '关于 PyiTOL Studio' : 'About PyiTOL Studio'),
        {
          label: 'iTOL Website',
          click: () => {
            import('electron').then(({ shell }) => shell.openExternal('https://itol.embl.de'))
          }
        }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

export function rebuildMenu(): void {
  Menu.setApplicationMenu(buildMenu())
}
