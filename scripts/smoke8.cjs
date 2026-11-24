const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function projectData(page, projectId) {
  return page.evaluate(async (id) => window.api.getProjectData(id), projectId)
}

async function bootstrap(page) {
  return page.evaluate(async () => window.api.bootstrap())
}

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e8-data')
  fs.rmSync(dataDir, { recursive: true, force: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.TODOLIST_USER_DATA = dataDir

  let app
  try {
    const executablePath = process.env.TODOLIST_TEST_EXECUTABLE
    app = executablePath
      ? await electron.launch({ executablePath, env })
      : await electron.launch({ args: ['.'], cwd: root, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')

    assert.equal((await bootstrap(page)).appVersion, '0.6.0')

    // 1280 宽度与 150% 日期字体下，日期列头部按钮应完整可点。
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800))
    await page.waitForTimeout(300)
    const dateHeaderVisible = async () =>
      page.evaluate(() => {
        const column = document.querySelector('.date-column').getBoundingClientRect()
        return [...document.querySelectorAll('.date-column .column-head-actions button')].map((button) => {
          const rect = button.getBoundingClientRect()
          return {
            title: button.title,
            visible: rect.left >= column.left - 1 && rect.right <= column.right + 1
          }
        })
      })
    assert.ok((await dateHeaderVisible()).every((item) => item.visible), '1280 宽度下日期列头部按钮应完整显示')
    await page.evaluate(async () => {
      await window.api.updateSettings({
        fonts: { regions: { dates: { scale: 150, family: 'system', customFamily: '' } } }
      })
    })
    await page.reload()
    await page.waitForSelector('.app-shell')
    assert.ok((await dateHeaderVisible()).every((item) => item.visible), '150% 日期字体下日期列头部按钮应完整显示')
    await page.evaluate(async () => {
      await window.api.updateSettings({
        fonts: { regions: { dates: { scale: 100, family: 'system', customFamily: '' } } }
      })
    })
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')

    const setup = await page.evaluate(async () => {
      const boot = await window.api.bootstrap()
      const projectA = boot.projects[0]
      const projectB = await window.api.createProject('置顶项目')
      const base = new Date(`${boot.today}T12:00:00`)
      const day = (offset) => {
        const value = new Date(base)
        value.setDate(value.getDate() + offset)
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
          value.getDate()
        ).padStart(2, '0')}`
      }
      await window.api.createTask({
        projectId: projectB.id,
        todoDate: day(-1),
        content: 'B本周任务',
        priority: 'medium'
      })
      await window.api.createTask({
        projectId: projectB.id,
        todoDate: day(-7),
        content: 'B上周任务',
        priority: 'medium'
      })
      const noticeTask = await window.api.createTask({
        projectId: projectA.id,
        todoDate: day(-2),
        content: '通知定位任务',
        priority: 'medium'
      })
      return { projectA, projectB, noticeTask }
    })
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')

    // 多行新增
    await page.locator('.add-input').click()
    await page.keyboard.type('第一行')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('第二行')
    assert.ok((await page.locator('.add-input').inputValue()).includes('\n'), 'Shift+Enter 应输入换行')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.body.innerText.includes('第一行'))
    let multiline = await page.evaluate(async (projectId) => {
      const data = await window.api.getProjectData(projectId)
      return data.todos.find((todo) => todo.content.includes('第一行'))
    }, setup.projectA.id)
    assert.equal(multiline?.content, '第一行\n第二行', '新增任务应保存多行内容')
    assert.equal(
      await page.locator('.task-card', { hasText: '第一行' }).locator('.task-title').evaluate((el) => getComputedStyle(el).whiteSpace),
      'pre-wrap',
      '任务标题应保留换行显示'
    )
    console.log('STEP 1: multiline add ok')

    // 多行编辑
    const multilineCard = page.locator('.task-card', { hasText: '第一行' }).first()
    await multilineCard.locator('.task-title').dblclick()
    await page.locator('.modal-card textarea.text-input').fill('第一行\n第二行\n第三行')
    await page.press('.modal-card textarea.text-input', 'Enter')
    await page.waitForSelector('.modal-card', { state: 'detached' })
    multiline = await page.evaluate(async (projectId) => {
      const data = await window.api.getProjectData(projectId)
      return data.todos.find((todo) => todo.content.includes('第一行'))
    }, setup.projectA.id)
    assert.ok(multiline?.content.includes('第三行'), '编辑任务应支持多行内容')
    console.log('STEP 2: multiline edit + Enter save ok')

    // 子项卡片
    const rootCard = page.locator('.task-card', { hasText: '第一行' }).first()
    await rootCard.locator('.task-row button[title^="添加子项"]').click()
    await page.locator('.modal-card textarea.text-input').fill('子项一\n子项二')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('子项一'))
    assert.ok(await page.locator('.subtask-row.subtask-card', { hasText: '子项一' }).count(), '子项应使用卡片样式')
    assert.ok(
      await page.locator('.subtask-row.subtask-card', { hasText: '子项一' }).evaluate((el) => getComputedStyle(el).borderTopWidth !== '0px'),
      '子项卡片应有边框'
    )
    console.log('STEP 3: subtask card ok')

    // 项目置顶
    const projectB = page.locator('.project-item', { hasText: '置顶项目' }).first()
    await projectB.hover()
    await projectB.locator('.row-more').click()
    await page.locator('.context-menu .context-item', { hasText: '置顶项目' }).click()
    await page.waitForTimeout(400)
    const pinnedProjects = (await bootstrap(page)).projects
    assert.equal(pinnedProjects[0].id, setup.projectB.id, '置顶项目应排在最前')
    assert.ok(pinnedProjects[0].pinnedAt, '项目应记录置顶时间')
    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(400)
    assert.equal((await bootstrap(page)).projects[0].id, setup.projectB.id, '置顶项目不应被最近编辑排序挤下')
    await page.reload()
    await page.waitForSelector('.app-shell')
    assert.equal((await bootstrap(page)).projects[0].id, setup.projectB.id, '刷新后项目置顶应保持')
    console.log('STEP 4: project pin + persistence ok')

    // 项目级日期分组
    await page.locator('.project-item', { hasText: '置顶项目' }).first().click()
    await page.waitForTimeout(300)
    await page.locator('.date-column button[title="日期分组规则"]').click()
    await page.locator('.grouping-mode-card', { hasText: '按周' }).click()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(300)
    const bGrouping = (await projectData(page, setup.projectB.id)).project.dateGrouping
    assert.equal(bGrouping.mode, 'week', '项目 B 应保存按周规则')
    assert.ok((await page.locator('.date-column').innerText()).includes('本周'), '项目 B 日期列应显示本周')

    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(300)
    const aGroupingBefore = (await projectData(page, setup.projectA.id)).project.dateGrouping
    assert.equal(aGroupingBefore.mode, 'day', '项目 A 应保持原按天规则')
    await page.locator('.date-column button[title="日期分组规则"]').click()
    await page.locator('.grouping-mode-card', { hasText: '每 N 天' }).click()
    await page.locator('.grouping-interval-row input').fill('10')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(300)
    const aGrouping = (await projectData(page, setup.projectA.id)).project.dateGrouping
    assert.equal(aGrouping.mode, 'interval', '项目 A 应保存每 N 天规则')
    assert.ok((await page.locator('.date-column').innerText()).includes('11.'), '项目 A 日期列应使用区间规则')

    await page.locator('.project-item', { hasText: '置顶项目' }).first().click()
    await page.waitForTimeout(300)
    assert.equal(
      (await projectData(page, setup.projectB.id)).project.dateGrouping.mode,
      'week',
      '项目 B 不应受项目 A 规则影响'
    )
    await page.reload()
    await page.waitForSelector('.app-shell')
    assert.equal((await projectData(page, setup.projectA.id)).project.dateGrouping.mode, 'interval', '刷新后项目 A 规则应保持')
    assert.equal((await projectData(page, setup.projectB.id)).project.dateGrouping.mode, 'week', '刷新后项目 B 规则应保持')
    console.log('STEP 5: per-project date grouping ok')

    // 全局历史分组 + 新项目继承
    await page.locator('.scope-switch button', { hasText: '全部项目' }).click()
    await page.waitForTimeout(400)
    assert.ok(
      await page.locator('.history-column button[title^="全部项目历史"]').count(),
      '全部项目历史应提供全局分组入口'
    )
    await page.locator('.history-column button[title^="全部项目历史"]').click()
    await page.locator('.grouping-mode-card', { hasText: '按周' }).click()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(300)
    assert.equal((await bootstrap(page)).settings.dateGrouping.mode, 'week', '全局历史规则应保存为按周')
    assert.ok((await page.locator('.history-column').innerText()).includes('本周'), '全部项目历史应使用全局周分组')
    await page.locator('.scope-switch button', { hasText: '本项目' }).click()
    await page.waitForTimeout(300)
    assert.equal(
      await page.locator('.history-column button[title^="全部项目历史"]').count(),
      0,
      '切换回本项目后不应显示全局分组入口'
    )
    const projectC = await page.evaluate(async () => window.api.createProject('继承项目'))
    assert.equal(
      (await projectData(page, projectC.id)).project.dateGrouping.mode,
      'week',
      '新项目应继承全局默认分组'
    )
    console.log('STEP 6: global history grouping + new project inheritance ok')

    // 系统提醒点击定位到任务；同时关闭已打开的设置弹窗
    await page.locator('.nav-item', { hasText: '健康管理' }).click()
    await page.waitForSelector('.health-view')
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.modal-card', { hasText: '设置' })
    const noticeTodo = await page.evaluate(async ({ projectId, content }) => {
      const data = await window.api.getProjectData(projectId)
      return data.todos.find((todo) => todo.content === content)
    }, { projectId: setup.projectA.id, content: '通知定位任务' })
    assert.ok(noticeTodo?.id, '通知定位任务应存在')
    await app.evaluate(({ BrowserWindow }, payload) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('reminder:clicked', payload)
    }, { todo: noticeTodo })
    await page.waitForFunction(() => document.body.innerText.includes('通知定位任务'))
    await page.waitForSelector('.task-card.is-selected')
    assert.equal(await page.locator('.modal-overlay').count(), 0, '提醒定位时应关闭已打开的设置弹窗')
    assert.ok(
      await page.locator('.task-card.is-selected', { hasText: '通知定位任务' }).count(),
      '点击提醒后应定位并选中对应 todo'
    )
    assert.ok((await page.locator('.main-title').innerText()).includes('默认项目'), '点击提醒后应切换到任务所属项目')
    console.log('STEP 7: reminder click navigates to todo ok')

    // 回收站单条 / 批量永久删除
    const recycleIds = await page.evaluate(async (projectId) => {
      const contents = ['回收单删', '回收批删一', '回收批删二']
      const ids = []
      for (const content of contents) {
        const task = await window.api.createTask({
          projectId,
          todoDate: new Date().toISOString().slice(0, 10),
          content,
          priority: 'medium'
        })
        await window.api.setTaskStatus(task.id, 'delete')
        ids.push(task.id)
      }
      return ids
    }, setup.projectA.id)
    assert.equal(recycleIds.length, 3)
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.locator('.side-bottom .nav-item', { hasText: '回收站' }).click()
    await page.waitForSelector('.recycle-item')
    assert.equal(await page.locator('.recycle-item').count(), 3, '回收站应显示三条任务')

    const single = page.locator('.recycle-item', { hasText: '回收单删' }).first()
    await single.locator('.recycle-check input').check()
    await single.locator('.recycle-delete').click()
    await page.waitForSelector('.modal-card', { hasText: '永久删除任务' })
    await page.keyboard.press('Escape')
    await page.locator('.modal-card', { hasText: '永久删除任务' }).waitFor({ state: 'detached' })
    assert.equal(await page.locator('.recycle-item').count(), 3, 'Escape 只应关闭删除确认框，不应关闭回收站')
    await single.locator('.recycle-delete').click()
    await page.waitForSelector('.modal-card', { hasText: '永久删除任务' })
    await page.locator('.modal-card', { hasText: '永久删除任务' }).locator('.modal-footer .btn-danger').click()
    await page.waitForFunction(() => document.querySelectorAll('.recycle-item').length === 2)

    await page.locator('.recycle-select-all input').check()
    await page.locator('.recycle-batch-delete').click()
    await page.waitForSelector('.modal-card', { hasText: '永久删除任务' })
    await page.locator('.modal-card', { hasText: '永久删除任务' }).locator('.modal-footer .btn-danger').click()
    await page.waitForFunction(() => document.querySelectorAll('.recycle-item').length === 0)
    const recycleLeft = await page.evaluate(async () => (await window.api.getRecycleBin()).length)
    assert.equal(recycleLeft, 0, '批量删除后回收站应为空')
    console.log('STEP 8: recycle single + batch delete ok')

    // 多项目时底部项目菜单不应被列容器裁切
    await page.evaluate(async () => {
      for (let index = 0; index < 12; index += 1) {
        await window.api.createProject(`滚动项目${index}`)
      }
    })
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.locator('.project-column .column-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.waitForTimeout(250)
    const lastProject = page.locator('.project-item').last()
    await lastProject.hover()
    await lastProject.locator('.row-more').click()
    await page.waitForSelector('.project-context-menu')
    const menuRect = await page.locator('.project-context-menu').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight }
    })
    assert.ok(menuRect.top >= 0 && menuRect.bottom <= menuRect.viewport, '项目菜单应完整显示在窗口内')
    await page.keyboard.press('Escape')
    console.log('STEP 9: project menu viewport clipping ok')

    // 归档项目中的回收站任务：恢复应给出明确提示并保留条目
    await page.evaluate(async () => {
      const boot = await window.api.bootstrap()
      const project = await window.api.createProject('归档回收项目')
      const task = await window.api.createTask({
        projectId: project.id,
        todoDate: boot.today,
        content: '归档回收任务',
        priority: 'medium'
      })
      await window.api.setTaskStatus(task.id, 'delete')
      await window.api.archiveProject(project.id)
    })
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.locator('.side-bottom .nav-item', { hasText: '回收站' }).click()
    await page.waitForSelector('.recycle-item')
    const archivedRecycleItem = page.locator('.recycle-item', { hasText: '归档回收任务' }).first()
    await archivedRecycleItem.locator('.btn-soft').click()
    await page.waitForFunction(() => document.querySelector('.toast-text')?.textContent.includes('已归档'))
    assert.equal(await page.locator('.recycle-item').count(), 1, '归档项目的任务恢复失败后应留在回收站')
    console.log('STEP 10: archived project restore guard ok')

    console.log('SMOKE8 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE8 FAILED:', error)
  process.exitCode = 1
})
