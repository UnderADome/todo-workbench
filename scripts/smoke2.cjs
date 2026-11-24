const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e2-data')
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
    page.on('pageerror', (error) => console.error('PAGE ERROR:', error))

    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')
    for (const text of ['任务A', '任务B']) {
      await page.fill('.add-input', text)
      await page.press('.add-input', 'Enter')
      await page.waitForFunction((value) => document.body.innerText.includes(value), text)
    }
    console.log('STEP 1: tasks ok')

    // 已完成展示方式：内联
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.locator('.settings-section .select-input').nth(0).selectOption('inline')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    const taskB = page.locator('.task-card', { hasText: '任务B' }).first()
    await taskB.locator('.task-check').click()
    await page.waitForSelector('.task-card.is-completed')
    assert.equal(await page.locator('.section-divider').count(), 0, '内联模式不应出现底部已完成分组')
    console.log('STEP 2: inline completed ok')

    // 恢复底部展示
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.locator('.settings-section .select-input').nth(0).selectOption('bottom')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForSelector('.section-divider')
    console.log('STEP 3: bottom completed ok')

    // 项目重命名
    const firstProject = page.locator('.project-item').first()
    await firstProject.hover()
    await firstProject.locator('.row-more').click()
    await page.locator('.context-item', { hasText: '重命名项目' }).click()
    await page.locator('.modal-card input.text-input').fill('301')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('301'))
    console.log('STEP 4: project rename ok')

    // 新建项目、归档、已归档恢复
    await page.locator('.project-column button[title="新建项目"]').click()
    await page.locator('.modal-card input.text-input').fill('手机银行')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('手机银行'))
    await page.locator('.project-item', { hasText: '301' }).first().click()
    await page.waitForTimeout(300)
    const mobileProject = page.locator('.project-item', { hasText: '手机银行' }).first()
    await mobileProject.hover()
    await mobileProject.locator('.row-more').click()
    await page.locator('.context-item', { hasText: '归档项目' }).click()
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForFunction(() => !document.body.innerText.includes('手机银行'))
    await page.locator('.column-footer', { hasText: '已归档项目' }).click()
    await page.locator('.archive-item', { hasText: '手机银行' }).locator('.btn-soft').click()
    await page.waitForTimeout(300)
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForFunction(() => document.body.innerText.includes('手机银行'))
    console.log('STEP 5: archive/unarchive ok')

    // 回收站恢复
    const taskA = page.locator('.task-card', { hasText: '任务A' }).first()
    await taskA.locator('.task-row button[title^="删除任务"]').click()
    await page.waitForSelector('.toast')
    await page.locator('.side-bottom .nav-item', { hasText: '回收站' }).click()
    await page.waitForSelector('.recycle-item')
    await page.locator('.recycle-item', { hasText: '任务A' }).locator('.btn-soft').click()
    await page.waitForTimeout(300)
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    await page.waitForFunction(() => document.body.innerText.includes('任务A'))
    console.log('STEP 6: recycle restore ok')

    // 项目列 / 日期列折叠
    await page.locator('.project-column button[title="折叠项目列"]').click()
    await page.waitForSelector('.project-column .project-avatar')
    await page.locator('.project-column .rail-expand').click()
    await page.waitForSelector('.project-item')
    await page.locator('.date-column button[title="折叠日期列"]').click()
    await page.waitForSelector('.date-column .date-chip')
    await page.locator('.date-column .rail-expand').click()
    await page.waitForSelector('.date-item')
    console.log('STEP 7: project/date collapse ok')

    // 列宽拖拽与持久化
    const before = await page.evaluate(() => window.api.bootstrap())
    const handle = page.locator('.resize-handle').first()
    const box = await handle.boundingBox()
    assert.ok(box, 'resize handle should exist')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => window.api.bootstrap())
    assert.ok(
      after.settings.columnWidths.function > before.settings.columnWidths.function,
      '列宽拖拽应增大功能区宽度'
    )
    console.log('STEP 8: resize persisted ok')

    // 断点折叠
    const setSize = async (width, height) => {
      await app.evaluate(
        ({ BrowserWindow }, size) => {
          const win = BrowserWindow.getAllWindows()[0]
          win.setSize(size.width, size.height)
        },
        { width, height }
      )
      await page.waitForTimeout(350)
    }
    await setSize(1280, 800)
    assert.equal(await page.locator('.sidebar-rail').count(), 0, '1280 宽应保持五列')
    const mainWidth = await page.evaluate(() => document.querySelector('.main-column')?.getBoundingClientRect().width ?? 0)
    assert.ok(mainWidth >= 420, `1280 宽应压缩列宽保证主列可读，实际 ${mainWidth}`)
    await setSize(1270, 800)
    assert.ok(await page.locator('.sidebar-rail').count(), '1270 宽应折叠功能区')
    await setSize(1090, 800)
    assert.ok(await page.locator('.project-column .project-avatar').count(), '1090 宽应折叠项目列')
    await setSize(970, 800)
    assert.ok(await page.locator('.date-column .date-chip').count(), '970 宽应折叠日期列')
    await setSize(850, 800)
    assert.equal(await page.locator('.history-column').count(), 0, '850 宽应关闭历史栏')
    assert.equal(await page.locator('.history-reopen').count(), 0, '自动关闭不显示手动展开把手')
    await setSize(1600, 900)
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(shotDir, '07-breakpoints-restored.png') })
    console.log('STEP 9: breakpoints ok')

    // 关闭到托盘
    await page.locator('.window-btn.close').click()
    await page.waitForTimeout(400)
    const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())
    assert.equal(visible, false, '关闭按钮应隐藏到托盘')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())
    await page.waitForTimeout(300)
    console.log('STEP 10: close to tray ok')

    // 测试系统通知 + 设置保存
    await page.locator('.side-bottom .nav-item', { hasText: '设置' }).click()
    await page.locator('button', { hasText: '测试系统通知' }).click()
    await page.waitForSelector('.toast')
    const toastText = await page.locator('.toast').innerText()
    assert.ok(toastText.includes('通知'), '测试通知应有结果提示')
    await page.locator('.modal-footer .btn-ghost').click()
    await page.waitForSelector('.modal-card', { state: 'detached' })
    console.log('STEP 11: notification test ok')

    await page.screenshot({ path: path.join(shotDir, '08-final2.png') })
    console.log('SMOKE2 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE2 FAILED:', error)
  process.exitCode = 1
})
