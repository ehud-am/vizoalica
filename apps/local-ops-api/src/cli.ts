import { loadConfig, loadConfigFile, writeConfigFile } from './config.js';
import { createLocalServer } from './server.js';

const [command = 'serve', path, remoteUrl, credential] = process.argv.slice(2);
if (command === 'configure') {
  if (!path || !remoteUrl || !credential)
    throw new Error('usage: configure <path> <remote-url> <credential>');
  writeConfigFile(path, { VIZOALICA_REMOTE_URL: remoteUrl, VIZOALICA_ADMIN_SECRET: credential });
  console.log(`Configuration written with user-only permissions: ${path}`);
} else if (command === 'revoke') {
  if (!path) throw new Error('usage: revoke <path>');
  writeConfigFile(path, {
    VIZOALICA_REMOTE_URL: 'https://revoked.invalid',
    VIZOALICA_ADMIN_SECRET: ''
  });
  console.log(`Local authorization revoked: ${path}`);
} else {
  const config = path ? loadConfigFile(path) : loadConfig();
  createLocalServer(config).listen(config.port, '127.0.0.1', () =>
    console.log(`Vizoalica local API listening on http://127.0.0.1:${config.port}`)
  );
}
