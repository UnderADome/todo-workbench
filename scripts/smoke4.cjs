const { _electron: electron } = require('playwright-core')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e4-data')
  fs.rmSync(dataDir, { recursive: true, force: true })
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

    await page.fill('.add-input', '级联测试')
    await page.press('.add-input', 'Enter')
    await page.waitForFunction(() => document.body.innerText.includes('级联测试'))

    const addChild = async (text) => {
      const card = page.locator('.task-card', { hasText: '级联测试' }).first()
      await card.locator('.task-row button[title^="添加子项"]').click()
      await page.locator('.modal-card textarea.text-input').fill(text)
      await page.locator('.modal-footer .btn-primary').click()
      await page.waitForFunction((value) => document.body.innerText.includes(value), text)
    }
    await addChild('子项A')
    await addChild('子项B')

    // 完成一个子项，父项仍待办
    await page.locator('.subtask-row', { hasText: '子项A' }).locator('.task-check').click()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.task-card.is-completed', { hasText: '级联测试' }).count(), 0)

    // 完成全部子项，父项自动完成
    await page.locator('.subtask-row', { hasText: '子项B' }).locator('.task-check').click()
    await page.waitForSelector('.task-card.is-completed')
    assert.ok(
      await page.locator('.task-card.is-completed', { hasText: '级联测试' }).count(),
      '全部直接子项完成应自动完成父项'
    )

    // 取消一个子项，父项恢复待办
    const completedRoot = page.locator('.task-card.is-completed', { hasText: '级联测试' }).first()
    await completedRoot.locator('.subtask-row', { hasText: '子项A' }).locator('.task-check').click()
    await page.waitForTimeout(500)
    assert.equal(
      await page.locator('.task-card.is-completed', { hasText: '级联测试' }).count(),
      0,
      '取消子项后父项应回到待办'
    )

    // 修改任务
    const pendingRoot = page.locator('.task-card', { hasText: '级联测试' }).first()
    await pendingRoot.locator('.task-row .task-title').dblclick()
    await page.locator('.modal-card textarea.text-input').fill('级联测试-已修改')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('级联测试-已修改'))

    // 修改优先级
    const edited = page.locator('.task-card', { hasText: '级联测试-已修改' }).first()
    await edited.locator('.task-row').click({ button: 'right' })
    await page.waitForSelector('.task-context-menu')
    await page.locator('.task-context-menu .context-item', { hasText: '高优先级' }).click()
    await page.waitForTimeout(400)
    assert.ok(
      await page.locator('.task-card', { hasText: '级联测试-已修改' }).locator('.priority-tag.high').count(),
      '优先级应更新为高'
    )

    // 置顶 / 取消置顶
    await edited.locator('.task-row').click({ button: 'right' })
    await page.locator('.task-context-menu .context-item', { hasText: '置顶任务' }).click()
    await page.waitForSelector('.pin-mark')
    const pinned = page.locator('.task-card', { hasText: '级联测试-已修改' }).first()
    await pinned.locator('.task-row').click({ button: 'right' })
    await page.locator('.task-context-menu .context-item', { hasText: '取消置顶' }).click()
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.pin-mark').count(), 0, '取消置顶后不应显示置顶标记')

    // 删除子项
    const childB = page.locator('.subtask-row', { hasText: '子项B' }).first()
    await childB.hover()
    await childB.locator('button[title^="删除子项"]').click()
    await page.locator('.modal-footer .btn-danger').click()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.subtask-row', { hasText: '子项B' }).count(), 0, '子项应被删除')
    console.log('STEP 1: cascade / edit / pin / child delete ok')

    // 第二项目 + 历史全部项目
    await page.locator('.project-column button[title="新建项目"]').click()
    await page.locator('.modal-card input.text-input').fill('项目B')
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForFunction(() => document.body.innerText.includes('项目B'))
    await page.locator('.date-column button[title^="跳转到日期"]').click()
    await page.locator('.date-picker-input').fill('2026-11-10')
    await page.waitForTimeout(300)
    await page.fill('.add-input', 'B往期任务')
    await page.press('.add-input', 'Enter')
    await page.waitForFunction(() => document.body.innerText.includes('B往期任务'))
    await page.locator('.scope-switch button', { hasText: '全部项目' }).click()
    await page.waitForSelector('.history-item')
    const historyItem = page.locator('.history-item', { hasText: 'B往期任务' }).first()
    assert.ok(await historyItem.count(), '全部项目历史应包含 B往期任务')
    assert.ok(
      await historyItem.locator('.project-chip', { hasText: '项目B' }).count(),
      '全部项目历史应显示项目标签'
    )
    await page.screenshot({ path: path.join(root, 'e2e', '10-final4.png') })
    console.log('STEP 2: all-project history ok')
    console.log('SMOKE4 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE4 FAILED:', error)
  process.exitCode = 1
})
