const { spawn } = require('node:child_process')
const path = require('node:path')

const env = { ...process.env }
// 某些 IDE / 自动化环境会把 Electron 强制当作 Node 运行，这里恢复真正的 Electron 模式。
delete env.ELECTRON_RUN_AS_NODE

const cli = path.join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit'
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
