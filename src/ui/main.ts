import App from './App.svelte';
import './styles/tokens.css';
import './styles/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('main.ts: #app mount point not found');

const app = new App({ target });

export default app;
