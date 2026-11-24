const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function addDays(date, offset) {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function startOfWeekMonday(date) {
  const next = new Date(date)
  const offset = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - offset)
  return next
}

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e5-data')
  const shotDir = path.join(root, 'e2e')
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(shotDir, { recursive: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.TODOLIST_USER_DATA = dataDir

  let app
  try {
    app = await electron.launch({ args: ['.'], cwd: root, env })
    const page = await app.firstWindow()
    page.setDefaultTimeout(8000)
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')

    const boot = await page.evaluate(async () => window.api.bootstrap())
    const today = new Date(`${boot.today}T12:00:00`)
    const dates = {
      today: formatDate(today),
      yesterday: formatDate(addDays(today, -1)),
      lastWeek: formatDate(addDays(today, -7)),
      older: formatDate(addDays(today, -20)),
      nextWeek: formatDate(addDays(today, 7)),
      old: formatDate(addDays(today, -40))
    }
    const seeded = await page.evaluate(async ({ projectId, dates: values }) => {
      const tasks = [
        [values.today, '今日任务'],
        [values.yesterday, '昨日任务'],
        [values.lastWeek, '上周任务'],
        [values.older, '更早任务'],
        [values.nextWeek, '下周任务'],
        [values.old, '更老任务']
      ]
      for (const [date, content] of tasks) {
        await window.api.createTask({ projectId, todoDate: date, content, priority: 'medium' })
      }
      return { projectId }
    }, { projectId: boot.projects[0].id, dates })
    assert.ok(seeded.projectId)
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.date-item')
    console.log('STEP 1: seed ok')

    // 打开日期分组配置并切换按周
    await page.locator('.date-column button[title="日期分组规则"]').click()
    await page.waitForSelector('.modal-card')
    await page.screenshot({ path: path.join(shotDir, '20-grouping-dialog.png') })
    await page.locator('.grouping-mode-card', { hasText: '按周' }).click()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(400)
    const weeklySettings = await page.evaluate(
      async (projectId) => (await window.api.getProjectData(projectId)).project.dateGrouping,
      seeded.projectId
    )
    assert.equal(weeklySettings.mode, 'week', '当前项目日期分组应持久化为按周')

    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.date-item')
    await page.waitForTimeout(300)
    const dateText = await page.locator('.date-column').innerText()
    assert.ok(dateText.includes('本周'), '按周模式应显示本周')
    assert.ok(dateText.includes('上周'), '按周模式应显示上周')
    assert.ok(dateText.includes('下周'), '按周模式应显示下周')
    await page.screenshot({ path: path.join(shotDir, '21-week-groups.png') })

    const historyText = await page.locator('.history-column').innerText()
    assert.ok(historyText.includes('昨日任务'), '历史应包含昨日未完成任务')
    assert.ok(historyText.includes('更早任务'), '历史应包含更早未完成任务')
    assert.ok(!historyText.includes('今日任务'), '历史遗留不应包含今天')
    assert.ok(!historyText.includes('下周任务'), '历史遗留不应包含未来')

    // 全部项目历史使用独立全局规则
    await page.evaluate(async ({ date }) => {
      const project = await window.api.createProject('项目B')
      await window.api.createTask({
        projectId: project.id,
        todoDate: date,
        content: 'B上周任务',
        priority: 'medium'
      })
    }, { date: dates.lastWeek })
    await page.locator('.scope-switch button', { hasText: '全部项目' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('B上周任务'))
    const bItem = page.locator('.history-item', { hasText: 'B上周任务' }).first()
    assert.ok(await bItem.locator('.project-chip', { hasText: '项目B' }).count(), '全部项目历史应显示项目标签')
    await page.locator('.scope-switch button', { hasText: '本项目' }).click()
    await page.waitForTimeout(300)
    console.log('STEP 2: weekly grouping + all-project history ok')

    // 选择上周，区间任务视图 + 默认新增日期 = 区间首日
    await page.locator('.date-item', { hasText: '上周' }).first().click()
    await page.waitForTimeout(300)
    assert.ok((await page.locator('.main-title').innerText()).includes('上周'))
    assert.ok((await page.locator('.main-column').innerText()).includes('上周任务'))
    await page.fill('.add-input', '上周新增任务')
    await page.press('.add-input', 'Enter')
    await page.waitForFunction(() => document.body.innerText.includes('上周新增任务'))
    const createdAt = await page.evaluate(async (projectId) => {
      const data = await window.api.getProjectData(projectId)
      return data.todos.find((item) => item.content === '上周新增任务')?.todoDate
    }, seeded.projectId)
    assert.equal(createdAt, formatDate(addDays(startOfWeekMonday(today), -7)), '非当前区间新增应落到区间首日')
    console.log('STEP 3: weekly range task + add date ok')

    // 切换每 N 天
    await page.locator('.date-column button[title="日期分组规则"]').click()
    await page.locator('.grouping-mode-card', { hasText: '每 N 天' }).click()
    await page.locator('.grouping-interval-row input').fill('10')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(400)
    const intervalSettings = await page.evaluate(
      async (projectId) => (await window.api.getProjectData(projectId)).project.dateGrouping,
      seeded.projectId
    )
    assert.equal(intervalSettings.mode, 'interval', '当前项目日期分组应持久化为每 N 天')
    assert.equal(intervalSettings.intervalDays, 10, 'N 应持久化为 10')
    assert.ok((await page.locator('.date-column').innerText()).includes('每 10 天'), '日期列应显示每 10 天区间')
    await page.screenshot({ path: path.join(shotDir, '22-interval-groups.png') })
    console.log('STEP 4: interval grouping ok')

    // 手动区间覆盖 + 拆分自动区间
    const rangeStart = formatDate(addDays(today, -4))
    const rangeEnd = formatDate(addDays(today, -2))
    await page.locator('.date-column button[title="日期分组规则"]').click()
    await page.locator('button', { hasText: '添加手动区间' }).click()
    const rangeRow = page.locator('.manual-range-row').last()
    await rangeRow.locator('input[type="date"]').nth(0).fill(rangeStart)
    await rangeRow.locator('input[type="date"]').nth(1).fill(rangeEnd)
    await rangeRow.locator('.range-label-input').fill('自定义段')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(400)
    const manualSettings = await page.evaluate(
      async (projectId) => (await window.api.getProjectData(projectId)).project.dateGrouping,
      seeded.projectId
    )
    assert.equal(manualSettings.manualRanges.length, 1, '当前项目手动区间应持久化')
    assert.equal(manualSettings.manualRanges[0].label, '自定义段', '手动区间名称应持久化')
    assert.ok((await page.locator('.date-column').innerText()).includes('自定义段'), '日期列应显示手动区间名称')
    await page.screenshot({ path: path.join(shotDir, '23-manual-mixed.png') })
    console.log('STEP 5: manual range override ok')

    // 改为按天 + 手动区间，验证混合示例
    await page.locator('.date-column button[title="日期分组规则"]').click()
    await page.locator('.grouping-mode-card', { hasText: '按天' }).click()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(400)
    const mixedSettings = await page.evaluate(
      async (projectId) => (await window.api.getProjectData(projectId)).project.dateGrouping,
      seeded.projectId
    )
    assert.equal(mixedSettings.mode, 'day', '当前项目混合模式应保留按天基础规则')
    assert.equal(mixedSettings.manualRanges.length, 1, '混合模式应保留手动区间')
    assert.ok((await page.locator('.date-column').innerText()).includes('自定义段'), '按天 + 手动区间应保留自定义段')
    await page.screenshot({ path: path.join(shotDir, '24-day-manual-mixed.png') })
    console.log('STEP 6: day + manual mixed ok')

    // 历史仍排除今天
    const finalHistory = await page.locator('.history-column').innerText()
    assert.ok(!finalHistory.includes('今日任务'), '历史仍不应包含今天任务')
    console.log('SMOKE5 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE5 FAILED:', error)
  process.exitCode = 1
})
