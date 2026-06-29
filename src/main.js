import { createAppRuntime } from './app-runtime.js?v=20260629111713';

const app = document.querySelector('#app');
const runtime = createAppRuntime({ app });

window.addEventListener('hashchange', runtime.route);
runtime.start();
