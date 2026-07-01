import { createAppRuntime } from './app-runtime.js?v=20260701141531';

const app = document.querySelector('#app');
const runtime = createAppRuntime({ app });

window.addEventListener('hashchange', runtime.route);
runtime.start();
