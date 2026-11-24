import { ScrollText, Sparkles } from 'lucide-react'
import changelogSource from '../../../../CHANGELOG.md?raw'
import { useAppStore } from '../store'
import { Modal } from './common'

interface ChangelogSection {
  title: string
  items: string[]
}

interface ChangelogEntry {
  version: string
  date: string
  sections: ChangelogSection[]
}

function parseChangelog(source: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let entry: ChangelogEntry | null = null
  let section: ChangelogSection | null = null

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('# ')) continue
    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim()
      const match = heading.match(/^(v[\d.]+)\s*[·—-]\s*(.+)$/)
      entry = {
        version: match?.[1] ?? heading,
        date: match?.[2] ?? '',
        sections: []
      }
      entries.push(entry)
      section = null
      continue
    }
    if (!entry) continue
    if (line.startsWith('### ')) {
      section = { title: line.slice(4).trim(), items: [] }
      entry.sections.push(section)
      continue
    }
    if (line.startsWith('- ')) {
      if (!section) {
        section = { title: '变更', items: [] }
        entry.sections.push(section)
      }
      section.items.push(line.slice(2).trim())
    }
  }
  return entries
}

const CHANGELOG_ENTRIES = parseChangelog(changelogSource)

interface ChangelogDialogProps {
  open: boolean
  onClose: () => void
}

export function ChangelogDialog({ open, onClose }: ChangelogDialogProps): React.JSX.Element {
  const appVersion = useAppStore((state) => state.appVersion)

  return (
    <Modal
      open={open}
      title="更新日志"
      subtitle={`当前版本 v${appVersion || '0.6.0'} · 按版本查看功能变化`}
      icon={<ScrollText size={18} />}
      width={640}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          知道了
        </button>
      }
    >
      <div className="changelog-list">
        {CHANGELOG_ENTRIES.map((entry) => (
          <article className="changelog-entry" key={`${entry.version}-${entry.date}`}>
            <div className="changelog-head">
              <span className="changelog-version">
                <Sparkles size={12} />
                {entry.version}
              </span>
              {entry.date ? <span className="changelog-date">{entry.date}</span> : null}
            </div>
            {entry.sections.map((section) => (
              <div className="changelog-section" key={`${entry.version}-${section.title}`}>
                <div className="changelog-section-title">{section.title}</div>
                <ul className="changelog-items">
                  {section.items.map((item, index) => (
                    <li key={`${section.title}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
        ))}
      </div>
    </Modal>
  )
}
