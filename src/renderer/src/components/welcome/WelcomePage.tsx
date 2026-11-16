import { useTranslation } from 'react-i18next'
import { FilePlus, FolderOpen, Wand2, BookOpen } from 'lucide-react'
import { useUIStore, useToastStore } from '../../stores/ui'
import { useProjectStore } from '../../stores/project'
import { useEffect, useState } from 'react'
import type { RecentProjectEntry, EngineStatus } from '@shared/types'

interface WelcomePageProps {
  engineStatus: EngineStatus
}

export function WelcomePage({ engineStatus }: WelcomePageProps): JSX.Element {
  const { t } = useTranslation()
  const setView = useUIStore(s => s.setView)
  const setProject = useProjectStore(s => s.setProject)
  const setWizardOpen = useUIStore(s => s.setWizardOpen)
  const [recent, setRecent] = useState<RecentProjectEntry[]>([])

  useEffect(() => {
    void window.pyitol.project.readRecentProjects().then(setRecent)
  }, [])

  const handleNew = async (): Promise<void> => {
    const data = await window.pyitol.project.newProject()
    setProject(data, null)
    setView('workbench')
  }

  const handleOpen = async (): Promise<void> => {
    const data = await window.pyitol.project.openProject()
    if (data) {
      setProject(data, null)
      setView('workbench')
    }
  }

  const handleExample = async (): Promise<void> => {
    const data = await window.pyitol.project.loadExampleProject()
    if (data) {
      setProject(data, null, true)
      setView('workbench')
    }
  }

  const handleOpenRecent = async (path: string): Promise<void> => {
    try {
      const content = await window.pyitol.files.readFile(path)
      const data = JSON.parse(content)
      setProject(data, path)
      setView('workbench')
      useProjectStore.getState().markClean()
      // Register the path in main so ⌘S works, and bump the recent list
      await window.pyitol.project.setCurrentPath(path)
      void window.pyitol.project.addRecentProject(
        path,
        data.name || 'Untitled Project',
        data.units?.length ?? 0
      )
    } catch (err) {
      useToastStore
        .getState()
        .pushToast('error', t('app.status_open_failed', { arg: (err as Error).message }))
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-parchment px-lg">
      {/* Logo — monochrome phylogenetic tree */}
      <div className="mb-xl flex flex-col items-center">
        <TreeLogo />
        <h1
          className="mt-lg font-display"
          style={{
            fontSize: 'var(--text-display-md)',
            fontWeight: 600,
            letterSpacing: 'var(--text-display-md--letter-spacing)',
            lineHeight: 'var(--text-display-md--line-height)'
          }}
        >
          PyiTOL Studio
        </h1>
        <p
          className="mt-xs text-ink-subtle"
          style={{
            fontSize: 'var(--text-body)',
            fontWeight: 300
          }}
        >
          {t('app.subtitle')}
        </p>
        {engineStatus !== 'ready' && (
          <p className="mt-xs text-ink-subtle" style={{ fontSize: 'var(--text-fine-print)' }}>
            {engineStatus === 'connecting'
              ? `⏳ ${t('app.engine_connecting')}`
              : `⚠ ${t('app.engine_disconnected')}`}
          </p>
        )}
      </div>

      {/* Action cards */}
      <div className="flex flex-wrap justify-center gap-lg" style={{ maxWidth: 800 }}>
        <ActionCard
          icon={<FilePlus size={24} />}
          title={t('welcome.new_project')}
          desc={t('welcome.new_project_desc')}
          shortcut="⌘N"
          onClick={handleNew}
        />
        <ActionCard
          icon={<FolderOpen size={24} />}
          title={t('welcome.open_project')}
          desc={t('welcome.open_project_desc')}
          shortcut="⌘O"
          onClick={handleOpen}
        />
        <ActionCard
          icon={<Wand2 size={24} />}
          title={t('welcome.wizard')}
          desc={t('welcome.wizard_desc')}
          onClick={() => setWizardOpen(true)}
        />
      </div>

      {/* Example project link */}
      <button
        className="mt-lg text-link"
        style={{ fontSize: 'var(--text-caption)' }}
        onClick={handleExample}
      >
        <BookOpen
          size={14}
          className="mr-xxs inline-block"
          style={{ verticalAlign: 'text-bottom' }}
        />
        {t('welcome.open_example')}
      </button>

      {/* Recent projects */}
      <div className="mt-xxl w-full" style={{ maxWidth: 480 }}>
        <p className="mb-sm field-label-strong" style={{ fontSize: 'var(--text-caption-strong)' }}>
          {t('welcome.recent')}
        </p>
        {recent.length === 0 ? (
          <p className="text-ink-subtle py-sm" style={{ fontSize: 'var(--text-caption)' }}>
            {t('welcome.no_recent')}
          </p>
        ) : (
          <div className="flex flex-col gap-xxs">
            {recent.map(entry => (
              <button
                key={entry.path}
                className="flex items-center justify-between rounded-sm px-sm py-xs hover:bg-pearl transition-colors"
                style={{ minHeight: 44 }}
                onClick={() => handleOpenRecent(entry.path)}
              >
                <div className="flex flex-col items-start">
                  <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600 }}>
                    {entry.name}
                  </span>
                  <span className="text-ink-subtle" style={{ fontSize: 'var(--text-fine-print)' }}>
                    {entry.path}
                  </span>
                </div>
                <span className="text-ink-subtle" style={{ fontSize: 'var(--text-fine-print)' }}>
                  {t('welcome.unit_count', { count: entry.unitCount })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drop hint */}
      <p className="mt-xxl text-ink-subtle" style={{ fontSize: 'var(--text-fine-print)' }}>
        {t('welcome.drop_hint')}
      </p>
    </div>
  )
}

interface ActionCardProps {
  icon: React.ReactNode
  title: string
  desc: string
  shortcut?: string
  onClick: () => void
}

function ActionCard({ icon, title, desc, shortcut, onClick }: ActionCardProps): JSX.Element {
  return (
    <button
      className="card flex flex-col items-start text-left transition-transform active:scale-95"
      style={{ width: 240, minHeight: 140 }}
      onClick={onClick}
    >
      <div className="mb-sm text-accent">{icon}</div>
      <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>{title}</h3>
      <p className="mt-xxs text-ink-muted" style={{ fontSize: 'var(--text-caption)' }}>
        {desc}
      </p>
      {shortcut && (
        <span
          className="mt-auto pt-sm text-ink-subtle"
          style={{ fontSize: 'var(--text-fine-print)' }}
        >
          {shortcut}
        </span>
      )}
    </button>
  )
}

/** Monochrome phylogenetic tree logo — four-leaf cladogram */
function TreeLogo(): JSX.Element {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink"
    >
      {/* Root */}
      <line x1="8" y1="32" x2="20" y2="32" />
      {/* First split */}
      <line x1="20" y1="18" x2="20" y2="46" />
      <line x1="20" y1="18" x2="36" y2="18" />
      <line x1="20" y1="46" x2="36" y2="46" />
      {/* Second split (top) */}
      <line x1="36" y1="10" x2="36" y2="26" />
      <line x1="36" y1="10" x2="52" y2="10" />
      <line x1="36" y1="26" x2="52" y2="26" />
      {/* Second split (bottom) */}
      <line x1="36" y1="38" x2="36" y2="54" />
      <line x1="36" y1="38" x2="52" y2="38" />
      <line x1="36" y1="54" x2="52" y2="54" />
    </svg>
  )
}
