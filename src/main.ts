import './styles/main.css';
import { App } from './app/App';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

const app = new App(root);
app.boot();

// Handy for debugging in the browser console: window.neonBand.store.state
(window as unknown as { neonBand: App }).neonBand = app;
