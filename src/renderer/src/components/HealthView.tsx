import { ChevronLeft, HeartPulse } from 'lucide-react'

export function HealthView({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <section className="health-view">
      <div className="health-card">
        <div className="health-icon">
          <HeartPulse size={38} />
        </div>
        <h2>健康管理 · 功能暂未开放</h2>
        <p>
          健康管理将拥有独立的功能面板与数据视图。
          <br />
          本期仅保留入口，项目与日期导航已自动折叠。
        </p>
        <button className="btn btn-soft" onClick={onBack}>
          <ChevronLeft size={13} />
          返回项目管理
        </button>
      </div>
    </section>
  )
}
