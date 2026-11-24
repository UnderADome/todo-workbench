import {
  BookOpen,
  Bell,
  CalendarDays,
  FolderOpen,
  Hourglass,
  Keyboard,
  ListTodo,
  Settings2,
  StickyNote
} from 'lucide-react'
import { useAppStore } from '../store'
import { SHORTCUT_DEFINITIONS } from '../shortcuts'
import { Modal, ShortcutKeys } from './common'

interface UsageGuideDialogProps {
  open: boolean
  onClose: () => void
}

export function UsageGuideDialog({ open, onClose }: UsageGuideDialogProps): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)

  return (
    <Modal
      open={open}
      title="使用说明"
      subtitle="任务操作、快捷键、日期分组与数据管理"
      icon={<BookOpen size={18} />}
      width={680}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          开始使用
        </button>
      }
    >
      <div className="guide-lead">
        单击任务可以选中它；双击任务可以直接编辑。选中任务后可以使用快捷键，也可以使用任务右侧的快捷按钮，或在任务上点击鼠标右键打开完整操作菜单。
      </div>

      <section className="guide-section">
        <div className="guide-section-head">
          <ListTodo size={16} />
          <h3>添加、完成与编辑任务</h3>
        </div>
        <ul className="guide-list">
          <li>在第四列底部的输入框中填写内容，按 Enter 或点击“添加”即可创建任务。</li>
          <li>输入或编辑多行内容时，按 Shift+Enter 换行；按 Enter 添加或保存。</li>
          <li>点击任务左侧的圆圈完成任务；再次点击可以取消完成。</li>
          <li>双击任务内容，或选中后按编辑快捷键，可以修改任务文字。</li>
          <li>使用任务右侧的 + 按钮添加子项；子项会以卡片形式缩进显示，层级不限。</li>
          <li>编辑后如果内容没有实际变化，不会记录编辑时间，也不会打乱项目排序。</li>
        </ul>
      </section>

      <section className="guide-section">
        <div className="guide-section-head">
          <Hourglass size={16} />
          <h3>长期任务与完成时间</h3>
        </div>
        <ul className="guide-list">
          <li>任务右侧的沙漏按钮或右键菜单可以标记/取消“长期工作”；根任务和子项都可以标记。</li>
          <li>根任务包含长期子项时，会在根任务上显示“长期工作”汇总标签。</li>
          <li>默认长期任务会从起始日期起在日期列各个分组中重复显示，可在设置中关闭；历史遗留项始终只出现一次。</li>
          <li>完成任务会记录具体完成日期和时间，并显示在任务卡片上。</li>
          <li>取消完成后再次标记完成，会询问是否使用当前时间更新最终完成时间，或保留上次完成时间。</li>
        </ul>
      </section>

      <section className="guide-section">
        <div className="guide-section-head">
          <StickyNote size={16} />
          <h3>列表式与便签式</h3>
        </div>
        <ul className="guide-list">
          <li>任务列表上方的“列表 / 便签”切换可以改变当前项目的展示方式，每个项目会记住自己的选择。</li>
          <li>列表式保留紧凑的纵向列表；便签式将根任务显示为便签，子项以内嵌清单展示。</li>
          <li>便签式在宽窗口显示两列，窄窗口自动变为单列；设置中可以指定新建项目的默认视图。</li>
        </ul>
      </section>

      <section className="guide-section">
        <div className="guide-section-head">
          <Keyboard size={16} />
          <h3>快捷键</h3>
        </div>
        <div className="guide-shortcut-list">
          {SHORTCUT_DEFINITIONS.map((item) => (
            <div className="guide-shortcut-row" key={item.action}>
              <div>
                <div className="guide-shortcut-name">{item.label}</div>
                <div className="guide-shortcut-desc">{item.description}</div>
              </div>
              <ShortcutKeys value={settings.shortcuts[item.action]} />
            </div>
          ))}
        </div>
        <div className="settings-note">
          快捷键只作用于当前选中的任务。可以在“设置 → 快捷键”中修改；修改后的快捷键会立即显示在这里。
        </div>
      </section>

      <section className="guide-section">
        <div className="guide-section-head">
          <Settings2 size={16} />
          <h3>任务快捷操作</h3>
        </div>
        <ul className="guide-list">
          <li>置顶、添加子项、优先级、标记不做和删除都提供了任务右侧快捷按钮，同时可以在右键菜单中找到。</li>
          <li>点击优先级按钮会按“高 → 中 → 低”循环切换；右键菜单和快捷键可以直接指定某一档优先级。</li>
          <li>“标记不做”只适用于根任务；子项支持置顶、添加子项、修改优先级和删除。</li>
          <li>删除根任务会进入回收站，并在底部提示中提供撤销；删除子项会连同它的全部子项一起删除。</li>
          <li>根任务可以设置提醒；提醒支持提前提醒、每天/每周/每月和每 N 分钟循环。</li>
          <li>点击系统提醒会打开应用并定位到对应任务。</li>
        </ul>
      </section>

      <section className="guide-section">
        <div className="guide-section-head">
          <CalendarDays size={16} />
          <h3>日期分组与历史遗留项</h3>
        </div>
        <ul className="guide-list">
          <li>日期列可以按天、按周或每 N 天聚合显示；点击列头右侧的调节按钮可以修改当前项目的规则。</li>
          <li>不同项目可以使用不同的日期规则；切换项目后日期列会随项目变化。</li>
          <li>“全部项目”历史有独立的全局分组规则，新建项目也继承这套全局默认；可从历史栏顶部的调节按钮修改。</li>
          <li>手动区间可以覆盖自动分组，适合把某几天单独归为一组；选择区间后第四列会显示区间内的全部任务。</li>
          <li>任务保持原来的日期，不会因为分组而被复制；任务上的日期标签用于区分归属。</li>
          <li>历史遗留项只显示今天之前仍未完成的任务，可以切换“当前项目”或“全部项目”。</li>
        </ul>
      </section>

      <section className="guide-section">
        <div className="guide-section-head">
          <FolderOpen size={16} />
          <h3>项目、归档与回收站</h3>
        </div>
        <ul className="guide-list">
          <li>项目列可以新建、重命名和归档项目；归档项目会从主列表隐藏，随时可以恢复。</li>
          <li>项目支持置顶，置顶项目始终排在最前；可以在项目行的“更多操作”菜单中切换。</li>
          <li>设置中可以控制选择项目后是否跳到项目列表最上方，默认关闭。</li>
          <li>回收站保留被删除的根任务 30 天，可以恢复、单条永久删除或勾选批量永久删除。</li>
          <li>历史遗留项支持全部项目范围；切换项目后，当前日期和分组会保留。</li>
        </ul>
      </section>

      <section className="guide-section">
        <div className="guide-section-head">
          <Bell size={16} />
          <h3>提醒、托盘与数据</h3>
        </div>
        <ul className="guide-list">
          <li>关闭窗口后应用会继续在托盘运行，提醒仍会触发；点击系统提醒会回到对应待办项。</li>
          <li>设置中可以测试系统通知、开启开机自启、调整各区域字体，以及立即备份数据。</li>
          <li>数据保存在本机 SQLite 中，每日启动自动备份并保留最近 7 份；不会上传到云端。</li>
        </ul>
      </section>
    </Modal>
  )
}
