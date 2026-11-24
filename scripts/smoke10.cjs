const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function projectData(page, projectId) {
  return page.evaluate(async (id) => window.api.getProjectData(id), projectId)
}

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e10-data')
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
    assert.equal(await page.evaluate(async () => (await window.api.bootstrap()).appVersion), '0.6.0')

    const setup = await page.evaluate(async () => {
      const boot = await window.api.bootstrap()
      const projectA = boot.projects[0]
      const projectB = await window.api.createProject('列表项目')
      const rootA = await window.api.createTask({
        projectId: projectA.id,
        todoDate: boot.today,
        content: '便签根任务',
        priority: 'high'
      })
      await window.api.createTask({
        projectId: projectA.id,
        parentId: rootA.id,
        todoDate: boot.today,
        content: '便签子项一',
        priority: 'medium'
      })
      await window.api.createTask({
        projectId: projectA.id,
        parentId: rootA.id,
        todoDate: boot.today,
        content: '便签子项二',
        priority: 'low'
      })
      const rootB = await window.api.createTask({
        projectId: projectB.id,
        todoDate: boot.today,
        content: '列表根任务',
        priority: 'medium'
      })
      await window.api.createTask({
        projectId: projectB.id,
        parentId: rootB.id,
        todoDate: boot.today,
        content: '列表子项',
        priority: 'medium'
      })
      return { projectA, projectB }
    })
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')
    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(300)

    // 切换 A 项目到便签式
    await page.locator('.view-switch button', { hasText: '便签' }).click()
    await page.waitForSelector('.task-grid.note-grid')
    await page.waitForTimeout(300)
    assert.equal((await projectData(page, setup.projectA.id)).project.taskView, 'note', '项目 A 应记住便签视图')
    assert.ok(await page.locator('.task-grid.note-grid .note-card', { hasText: '便签根任务' }).count(), '根任务应显示为便签')
    assert.ok(
      await page.locator('.note-card .subtask-row.note-subtask', { hasText: '便签子项一' }).count(),
      '子项应以内嵌清单展示'
    )
    assert.equal(
      await page.locator('.note-card .subtask-row.subtask-card').count(),
      0,
      '便签模式子项不应使用列表卡片样式'
    )
    assert.ok(
      await page.locator('.view-switch button', { hasText: '便签' }).evaluate((el) => el.classList.contains('active')),
      '便签切换按钮应处于选中态'
    )
    console.log('STEP 1: note view UI ok')

    // B 项目保持列表式
    await page.locator('.project-item', { hasText: '列表项目' }).first().click()
    await page.waitForTimeout(300)
    assert.equal((await projectData(page, setup.projectB.id)).project.taskView, 'list', '项目 B 应保持列表视图')
    assert.ok(await page.locator('.task-grid.list-grid').count(), '项目 B 应显示列表视图')
    assert.ok(await page.locator('.task-card', { hasText: '列表根任务' }).count(), '列表根任务应显示')
    assert.ok(await page.locator('.subtask-row.subtask-card', { hasText: '列表子项' }).count(), '列表子项应保留缩进卡片样式')
    console.log('STEP 2: per-project list/note memory ok')

    // reload 后按项目保持
    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(300)
    assert.ok(await page.locator('.task-grid.note-grid').count(), 'reload 后项目 A 应保持便签视图')
    await page.locator('.project-item', { hasText: '列表项目' }).first().click()
    await page.waitForTimeout(300)
    assert.ok(await page.locator('.task-grid.list-grid').count(), 'reload 后项目 B 应保持列表视图')
    console.log('STEP 3: view persistence ok')

    // 便签模式自适应列数
    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(300)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 970))
    await page.waitForTimeout(400)
    const wideColumns = await page
      .locator('.task-grid.note-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length)
    assert.ok(wideColumns >= 2, '宽窗口便签视图应为多列')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800))
    await page.waitForTimeout(400)
    const narrowColumns = await page
      .locator('.task-grid.note-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length)
    assert.equal(narrowColumns, 1, '窄窗口便签视图应为单列')
    console.log('STEP 4: responsive note grid ok')

    // 设置新建项目默认视图
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.waitForSelector('.modal-card', { hasText: '设置' })
    await page
      .locator('.form-field', { hasText: '新建项目默认任务视图' })
      .locator('select')
      .selectOption('note')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForTimeout(300)
    assert.equal(
      await page.evaluate(async () => (await window.api.bootstrap()).settings.taskViewDefault),
      'note',
      '设置应保存新建项目默认视图'
    )
    const projectC = await page.evaluate(async () => window.api.createProject('新便签项目'))
    assert.equal((await projectData(page, projectC.id)).project.taskView, 'note', '新项目应继承默认便签视图')
    assert.equal((await projectData(page, setup.projectB.id)).project.taskView, 'list', '已有项目不应受默认值影响')
    console.log('STEP 5: default view setting + new project inheritance ok')

    // 切回列表式
    await page.locator('.project-item', { hasText: '默认项目' }).first().click()
    await page.waitForTimeout(300)
    await page.locator('.view-switch button', { hasText: '列表' }).click()
    await page.waitForTimeout(300)
    assert.equal((await projectData(page, setup.projectA.id)).project.taskView, 'list', '项目 A 应切换回列表')
    assert.ok(await page.locator('.task-grid.list-grid').count(), '切换后应显示列表视图')
    console.log('STEP 6: switch back to list ok')

    console.log('SMOKE10 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE10 FAILED:', error)
  process.exitCode = 1
})
