import { createAppRuntime } from './app-runtime.js?v=20260711144845';

const app = document.querySelector('#app');
const runtime = createAppRuntime({ app });

window.addEventListener('hashchange', runtime.route);
runtime.start();
