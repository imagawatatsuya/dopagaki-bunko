import { createAppRuntime } from './app-runtime.js?v=20260701143046';

const app = document.querySelector('#app');
const runtime = createAppRuntime({ app });

window.addEventListener('hashchange', runtime.route);
runtime.start();
