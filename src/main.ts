import "./style.css";
import { Game } from "./game/Game";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Elemento #app nao encontrado.");
}

const game = new Game(app);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
