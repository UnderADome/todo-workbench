const { _electron: electron } = require('playwright-core')
const { spawn, execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert')

async function main() {
  const root = process.cwd()
  const dataDir = path.join(root, 'e2e9-data')
  fs.rmSync(dataDir, { recursive: true, force: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.TODOLIST_USER_DATA = dataDir

  const executablePath = process.env.TODOLIST_TEST_EXECUTABLE
  const launchPackaged = (args = []) =>
    executablePath
      ? electron.launch({ executablePath, env, args })
      : electron.launch({ args: ['.', ...args], cwd: root, env })

  let app
  try {
    app = await launchPackaged()
    let page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')

    const setup = await page.evaluate(async () => {
      const boot = await window.api.bootstrap()
      const project = boot.projects[0]
      const other = await window.api.createProject('协议测试项目')
      const task = await window.api.createTask({
        projectId: project.id,
        todoDate: boot.today,
        content: '协议定位任务',
        priority: 'high'
      })
      return { taskId: task.id, otherId: other.id, projectId: project.id }
    })
    assert.ok(setup.taskId)

    await page.reload()
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')
    await page.locator('.project-item', { hasText: '协议测试项目' }).first().click()
    await page.waitForTimeout(300)

    const protocolUrl = `todolist://reminder/${encodeURIComponent(setup.taskId)}`
    const secondCommand = executablePath ?? require('electron')
    const secondArgs = executablePath ? [protocolUrl] : ['.', protocolUrl]
    const second = spawn(secondCommand, secondArgs, { cwd: root, env, stdio: 'ignore' })
    await new Promise((resolve) => second.once('exit', resolve))
    await page.waitForFunction(() => document.body.innerText.includes('协议定位任务'))
    await page.waitForSelector('.task-card.is-selected', { hasText: '协议定位任务' })
    assert.ok(
      (await page.locator('.main-title').innerText()).includes('默认项目'),
      '第二实例协议激活应切换回任务所属项目'
    )
    console.log('STEP 1: second-instance protocol navigation ok')

    const registry = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Classes\\todolist\\shell\\open\\command'],
      { encoding: 'utf8' }
    )
    if (executablePath) {
      assert.ok(/win-unpacked/i.test(registry), '打包版协议应使用应用可执行文件')
    } else {
      assert.ok(/electron\.exe/i.test(registry), '协议应使用 Electron 可执行文件')
      assert.ok(/TodoList/i.test(registry), '协议命令应包含应用路径，避免打开默认 Electron 页面')
    }
    console.log('STEP 2: protocol registration includes app path ok')

    await app.close()
    app = null

    app = await launchPackaged([protocolUrl])
    page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    await page.waitForSelector('.app-shell')
    await page.waitForSelector('.add-input')
    await page.waitForFunction(() => document.body.innerText.includes('协议定位任务'))
    await page.waitForSelector('.task-card.is-selected', { hasText: '协议定位任务' })
    assert.ok(
      (await page.locator('.main-title').innerText()).includes('默认项目'),
      '冷启动协议激活应打开任务所属项目'
    )
    await page.locator('.side-bottom .nav-item', { hasText: '更新日志' }).click()
    await page.waitForSelector('.changelog-entry')
    assert.ok(
      (await page.locator('.modal-card').innerText()).includes('默认 Electron 页面'),
      '打包产物更新日志应包含提醒协议修复说明'
    )
    console.log('STEP 3: cold-start protocol navigation ok')

    console.log('SMOKE9 OK')
  } finally {
    if (app) await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('SMOKE9 FAILED:', error)
  process.exitCode = 1
})
