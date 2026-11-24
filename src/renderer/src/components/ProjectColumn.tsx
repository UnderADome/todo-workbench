import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ChevronLeft, ChevronRight, Folder, Lock, MoreHorizontal, Pin, Plus } from 'lucide-react'
import type { Project } from '@shared/types'

interface ProjectColumnProps {
  projects: Project[]
  selectedProjectId: string | null
  archivedCount: number
  collapsed: boolean
  locked: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (project: Project) => void
  onArchive: (project: Project) => void
  onPin: (project: Project) => void
  onOpenArchived: () => void
  onToggleCollapse: () => void
}

function relativeEdited(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return '刚刚编辑'
  if (diff < 60 * 60_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))} 小时前`
  const date = new Date(iso)
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')} 编辑`
}

function avatarText(name: string): string {
  return name.length <= 3 ? name : name.slice(0, 2)
}

export function ProjectColumn({
  projects,
  selectedProjectId,
  archivedCount,
  collapsed,
  locked,
  onSelect,
  onNew,
  onRename,
  onArchive,
  onPin,
  onOpenArchived,
  onToggleCollapse
}: ProjectColumnProps): React.JSX.Element {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuProject = projects.find((project) => project.id === menuId) ?? null

  useEffect(() => {
    if (!menuId) return
    const close = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenuId(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuId(null)
    }
    const closeMenu = (): void => setMenuId(null)
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [menuId])

  const openMenu = (project: Project, button: HTMLElement): void => {
    const rect = button.getBoundingClientRect()
    const width = 180
    const height = 148
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const top =
      rect.bottom + 4 + height > window.innerHeight - 8
        ? Math.max(8, rect.top - height - 4)
        : rect.bottom + 4
    setMenuPosition({ left, top })
    setMenuId((current) => (current === project.id ? null : project.id))
  }

  if (collapsed) {
    return (
      <section className={`column project-column ${locked ? 'column-locked' : ''}`}>
        <div className="column-rail project-rail">
          {locked ? (
            <>
              <div className="rail-lock" title="健康管理模式下不可用">
                <Lock size={14} />
              </div>
              <div className="rail-disabled-icon">
                <Folder size={17} />
              </div>
            </>
          ) : (
            <>
              <button className="rail-expand" title="展开项目列" onClick={onToggleCollapse}>
                <ChevronRight size={13} />
              </button>
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`project-avatar ${selectedProjectId === project.id ? 'active' : ''}`}
                  title={project.name}
                  onClick={() => onSelect(project.id)}
                >
                  {avatarText(project.name)}
                </button>
              ))}
              <button className="rail-add" title="新建项目" onClick={onNew}>
                <Plus size={13} />
              </button>
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="column project-column">
      <div className="column-expanded">
        <div className="column-head">
          <div>
            <div className="column-title">
              项目 <span className="count-badge">{projects.length}</span>
            </div>
            <div className="column-subtitle">置顶优先 · 最近编辑排序</div>
          </div>
          <div className="column-head-actions">
            <button className="mini-icon-button" title="新建项目" onClick={onNew}>
              <Plus size={13} />
            </button>
            <button className="mini-icon-button" title="折叠项目列" onClick={onToggleCollapse}>
              <ChevronLeft size={13} />
            </button>
          </div>
        </div>
        <div className="column-scroll">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${selectedProjectId === project.id ? 'active' : ''} ${
                project.pinnedAt ? 'pinned' : ''
              }`}
              onClick={() => onSelect(project.id)}
            >
              <span className="project-dot" />
              <div className="project-main">
                <div className="project-name">{project.name}</div>
                <div className="project-meta">
                  {project.pinnedAt ? '已置顶 · ' : ''}
                  {relativeEdited(project.lastEditedAt)}
                </div>
              </div>
              <span className="project-count">{project.todayPendingCount ?? 0}</span>
              <button
                className="row-more"
                title="项目操作"
                onClick={(event) => {
                  event.stopPropagation()
                  openMenu(project, event.currentTarget)
                }}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="column-footer" onClick={onOpenArchived}>
          <Archive size={13} />
          已归档项目
          <span>{archivedCount}</span>
        </button>
      </div>

      {menuProject
        ? createPortal(
            <div
              ref={menuRef}
              className="context-menu project-context-menu"
              style={{ left: menuPosition.left, top: menuPosition.top }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="context-item"
                onClick={() => {
                  setMenuId(null)
                  onPin(menuProject)
                }}
              >
                <Pin size={13} />
                {menuProject.pinnedAt ? '取消置顶' : '置顶项目'}
              </button>
              <button
                className="context-item"
                onClick={() => {
                  setMenuId(null)
                  onRename(menuProject)
                }}
              >
                重命名项目
              </button>
              <button
                className="context-item danger"
                onClick={() => {
                  setMenuId(null)
                  onArchive(menuProject)
                }}
              >
                <Archive size={13} />
                归档项目
              </button>
            </div>,
            document.body
          )
        : null}
    </section>
  )
}
