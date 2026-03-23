const { execSync } = require('child_process')
execSync('npx next start', { stdio: 'inherit', cwd: __dirname })
