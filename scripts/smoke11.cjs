const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function getTodo(page, projectId, content) {
  return page.evaluate(async ({ projectId: id, content: text }) => {
    const data = await window.api.getProjectData(id)
    return data.todos.find((todo) => todo.content === text) ?? null
  }, { projectId, content })
}

async function waitTodo(page, projectId, content, predicate, label) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const todo = await getTodo(page, projectId, content)
    if (todo && predicate(todo)) return todo
    await page.waitForTimeout(100)
  }
  throw new Error(`等待任务状态失败：${label} / ${content}`)
}

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e11-data')
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
    const version = await page.evaluate(async () => (await window.api.bootstrap()).appVersion)
    assert.equal(version, '0.6.0')

    const setup = await page.evaluate(async () => {
      const boot = await window.api.bootstrap()
      const projectA = boot.projects[0]
      const projectB = await window.api.createProject('排序项目B')
      const base = new Date(`${boot.today}T12:00:00`)
      const fmt = (date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
          date.getDate()
        ).padStart(2, '0')}`
      const lastWeek = new Date(base)
      lastWeek.setDate(lastWeek.getDate() - 7)
      const longRoot = await window.api.createTask({
        projectId: projectA.id,
        todoDate: fmt(lastWeek),
        content: '长期交付任务',
        priority: 'high'
      })
      const longChild = await window.api.createTask({
        projectId: projectA.id,
        parentId: longRoot.id,
        todoDate: fmt(lastWeek),
        content: '长期子项',
        priority: 'low'
      })
      await window.api.setTaskLongTerm(longRoot.id, true)
      await window.api.setTaskLongTerm(longChild.id, true)
      const summaryRoot = await window.api.createTask({
        projectId: projectA.id,
        todoDate: boot.today,
        content: '汇总标签根',
        priority: 'medium'
      })
      const summaryChild = await window.api.createTask({
        projectId: projectA.id,
        parentId: summaryRoot.id,
        todoDate: boot.today,
        content: '长期子任务',
        priority: 'medium'
      })
      await window.api.setTaskLongTerm(summaryChild.id, true)
      const normalTask = await window.api.createTask({
        projectId: projectA.id,
        todoDate: boot.today,
        content: '再次完成测试',
        priority: 'medium'
      })
      const uiTask = await window.api.createTask({
        projectId: projectA.id,
        todoDate: boot.today,
        content: 'UI长期任务',
        priority: 'medium'
      })
      await window.api.updateProjectDateGrouping(projectA.id, {
        mode: 'week',
        intervalDays: 10,
        manualRanges: []
      })
      return { projectA, projectB, longRoot, normalTask, uiTask, today: boot.today }
    })
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.date-item')
    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(300)
    await page.locator('.date-item', { hasText: '本周' }).first().click()
    await page.waitForTimeout(300)

    // 长期任务：所有时间段显示、根标签、子项标签、历史只出现一次
    assert.ok(
      await page.locator('.task-card', { hasText: '长期交付任务' }).count(),
      '长期任务应在当前周分组显示'
    )
    assert.ok(
      await page.locator('.task-card', { hasText: '长期交付任务' }).locator('.longterm-tag').count(),
      '长期根任务应显示长期工作标签'
    )
    assert.ok(
      await page.locator('.task-card', { hasText: '汇总标签根' }).locator('.longterm-tag').count(),
      '含长期子项时应显示根任务的汇总标签'
    )
    assert.equal(
      await page.locator('.history-item', { hasText: '长期交付任务' }).count(),
      1,
      '长期任务在历史遗留项中应只出现一次'
    )
    assert.ok(await page.locator('.history-longterm').count(), '历史遗留项应显示长期标签')

    const uiCard = page.locator('.task-card', { hasText: 'UI长期任务' }).first()
    await uiCard.locator('.task-row button[title="标记为长期工作"]').click()
    await page.waitForTimeout(300)
    const uiTodo = await getTodo(page, setup.projectA.id, 'UI长期任务')
    assert.equal(uiTodo.isLongTerm, true, '长期按钮应写入长期标识')
    assert.ok(await page.locator('.task-card', { hasText: 'UI长期任务' }).locator('.longterm-tag').count())
    console.log('STEP 1: long-term display, labels, history, UI toggle ok')

    // 关闭日期列重复显示
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.modal-card', { hasText: '设置' })
    const repeatCheckbox = page
      .locator('.check-row', { hasText: '长期任务在日期列的所有分组中重复显示' })
      .locator('input')
    assert.equal(await repeatCheckbox.isChecked(), true, '长期重复显示默认应开启')
    await repeatCheckbox.uncheck()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    assert.equal(
      await page.evaluate(async () => (await window.api.bootstrap()).settings.longTermRepeatInDateGroups),
      false,
      '长期重复显示设置应保存'
    )
    await page.locator('.date-item', { hasText: '本周' }).first().click()
    await page.waitForTimeout(300)
    assert.equal(
      await page.locator('.task-card', { hasText: '长期交付任务' }).count(),
      0,
      '关闭重复后长期任务不应出现在不所属的日期分组'
    )
    await page.locator('.date-item', { hasText: '上周' }).first().click()
    await page.waitForTimeout(300)
    assert.ok(
      await page.locator('.task-card', { hasText: '长期交付任务' }).count(),
      '关闭重复后长期任务仍应出现在原日期分组'
    )
    console.log('STEP 2: long-term repeat setting ok')

    // 完成时间记录、取消完成再完成提示、保留/更新最终完成时间
    await page.locator('.date-item', { hasText: '本周' }).first().click()
    await page.waitForTimeout(300)
    const normalCard = page.locator('.task-card', { hasText: '再次完成测试' }).first()
    await normalCard.locator('.task-row .task-check').click()
    const done1 = await waitTodo(page, setup.projectA.id, '再次完成测试', (todo) => todo.status === 'done', '首次完成')
    assert.ok(done1.completedAt, '完成时应记录完成时间')
    assert.ok(done1.lastCompletedAt, '完成时应记录最近完成时间')
    const metaText = await page.locator('.task-card', { hasText: '再次完成测试' }).locator('.task-meta').innerText()
    assert.match(metaText, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/, '任务上应显示具体完成时间')

    await normalCard.locator('.task-row .task-check').click()
    const reopened = await waitTodo(page, setup.projectA.id, '再次完成测试', (todo) => todo.status === 'todo', '取消完成')
    assert.equal(reopened.completedAt, null, '取消完成后当前完成时间应为空')
    assert.equal(reopened.lastCompletedAt, done1.completedAt, '取消完成后应保留上次完成时间')

    await normalCard.locator('.task-row .task-check').click()
    await page.waitForSelector('.modal-card', { hasText: '再次完成' })
    await page.locator('.modal-card', { hasText: '再次完成' }).locator('.modal-footer .btn-soft').click()
    const kept = await waitTodo(page, setup.projectA.id, '再次完成测试', (todo) => todo.status === 'done', '保留原完成时间')
    assert.equal(kept.completedAt, done1.completedAt, '保留原完成时间应沿用上次时间')
    assert.equal(kept.lastCompletedAt, done1.completedAt)

    await normalCard.locator('.task-row .task-check').click()
    await waitTodo(page, setup.projectA.id, '再次完成测试', (todo) => todo.status === 'todo', '再次取消完成')
    await page.waitForTimeout(1100)
    await normalCard.locator('.task-row .task-check').click()
    await page.waitForSelector('.modal-card', { hasText: '再次完成' })
    await page.locator('.modal-card', { hasText: '再次完成' }).locator('.modal-footer .btn-primary').click()
    const updated = await waitTodo(page, setup.projectA.id, '再次完成测试', (todo) => todo.status === 'done', '使用当前完成时间')
    assert.notEqual(updated.completedAt, done1.completedAt, '使用当前时间应更新最终完成时间')
    assert.ok(new Date(updated.completedAt).getTime() > new Date(done1.completedAt).getTime(), '新完成时间应晚于旧时间')
    assert.equal(updated.lastCompletedAt, updated.completedAt)
    console.log('STEP 3: completion time record/prompt/preserve/update ok')

    // 项目选择跳顶默认关闭；开启后选择项目跳到最上方
    const beforeProjects = await page.evaluate(async () => (await window.api.bootstrap()).projects)
    assert.equal(
      await page.evaluate(async () => (await window.api.bootstrap()).settings.moveSelectedProjectToTop),
      false,
      '项目选择跳顶默认应关闭'
    )
    assert.equal(beforeProjects[0].id, setup.projectA.id, '测试前置条件：项目 A 应排在第一位')
    await page.locator('.project-item', { hasText: '排序项目B' }).first().click()
    await page.waitForTimeout(300)
    const afterSelect = await page.evaluate(async () => (await window.api.bootstrap()).projects)
    assert.equal(afterSelect[0].id, setup.projectA.id, '关闭时选择项目不应跳到最上方')

    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.modal-card', { hasText: '设置' })
    await page
      .locator('.check-row', { hasText: '选择项目后跳到项目列表最上方' })
      .locator('input')
      .check()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.locator('.project-item', { hasText: '排序项目B' }).first().click()
    await page.waitForTimeout(300)
    const afterMove = await page.evaluate(async () => (await window.api.bootstrap()).projects)
    assert.equal(afterMove[0].id, setup.projectB.id, '开启后选择项目应跳到最上方')
    console.log('STEP 4: selected project move-to-top setting ok')

    console.log('SMOKE11 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE11 FAILED:', error)
  process.exitCode = 1
})
