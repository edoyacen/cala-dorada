/**
 * main.js — boot: make the canvas, read the URL (?shot=…, ?seed=…, ?load), build
 * the game and start the frame loop. Nothing is fetched: every module here is a
 * file beside this one.
 */
import { Game } from './game.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = params.get('seed') ?? 'cala-dorada';
const canvas = document.getElementById('stage');
const boot = document.getElementById('boot');

function fail(message) {
  if (!boot) return;
  boot.classList.remove('gone');
  boot.innerHTML = `<span><b>CALA DORADA</b> — ${message}</span>`;
}

try {
  const game = new Game(canvas, { seed, shot, load: params.get('load') === '1' });
  window.calaDorada = game;
  if (boot) {
    boot.classList.add('gone');
    setTimeout(() => boot.remove(), 600);
  }
  game.start(shot ? game.shotMode : null);
  // Keep the mouse cursor out of the canvas paint; the game draws its own.
  canvas.addEventListener('pointerdown', () => canvas.focus());
} catch (error) {
  console.error(error);
  fail('the city could not be built. See the console.');
}
