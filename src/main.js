import { createAppRuntime } from './app-runtime.js?v=20260619021344';

const app = document.querySelector('#app');
const runtime = createAppRuntime({ app });

window.addEventListener('hashchange', runtime.route);
runtime.start();
