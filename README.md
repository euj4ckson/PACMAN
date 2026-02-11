# PAC-MAN 3D (Three.js + TypeScript + Vite)

Jogo PAC-MAN 3D jogavel no navegador, com movimentacao em grid, pellets/power pellets, IA de fantasmas (BFS), HUD, estados de partida e audio via WebAudio (sem arquivos externos).

## Requisitos

- Node.js LTS (recomendado: 20.x ou 22.x)
- npm (ja vem com Node)
- VS Code (recomendado)

## Como rodar no VS Code

1. Abra esta pasta no VS Code (`File > Open Folder`).
2. Abra o terminal integrado (`Ctrl + ``).
3. Execute:

```bash
npm install
npm run dev
```

4. Abra a URL mostrada no terminal (normalmente `http://localhost:5173`).

## Scripts

- `npm run dev`: inicia servidor de desenvolvimento (Vite)
- `npm run dev:mobile`: inicia servidor acessivel pela rede local (celular)
- `npm run build`: valida TypeScript e gera build de producao em `dist/`
- `npm run preview`: serve localmente o build de producao
- `npm run preview:mobile`: serve build na rede local (celular)

Fluxo completo:

```bash
npm install
npm run build
npm run preview
```

## Controles

- `Setas` ou `WASD`: mover o PAC-MAN
- `Enter`: iniciar partida / continuar / reiniciar
- `C`: alternar entre 2 distancias de camera (perto/longe)
- `Celular`: Joystick virtual ou setas touch (configuravel no HUD antes de iniciar) + botoes `START` e `CAM`
- Inicio de rodada com contagem regressiva de 3 segundos (tempo para ajustar e ocultar HUD)
- Layout responsivo para portrait/landscape, telas pequenas e tablets

## Rodar no celular (mesma rede Wi-Fi)

1. No computador, rode:

```bash
npm run dev:mobile
```

2. Descubra o IP local da sua maquina (exemplo: `192.168.0.23`).
3. No celular, abra:
   - `http://SEU_IP:5173`
   - Exemplo: `http://192.168.0.23:5173`
4. Se nao abrir:
   - verifique firewall do Windows liberando a porta `5173`
   - confirme que PC e celular estao na mesma rede

## Regras implementadas

- Labirinto 3D a partir de grid 21x21
- Pellets normais (+10 pontos)
- 4 power pellets (+50 pontos), ativam `frightened` por 8 segundos
- 4 fantasmas com estados:
  - `chase`
  - `scatter`
  - `frightened`
  - `respawn`
- IA em intersecoes com pathfinding BFS
- Regra de evitar reversao imediata (exceto em `frightened`)
- Colisao:
  - Fantasma em `frightened`: pode ser comido (+200)
  - Fantasma normal: jogador perde 1 vida e rodada reseta
- Vitoria ao coletar todos os pellets

## Estrutura

```text
src/
  main.ts
  style.css
  game/
    Audio.ts
    Game.ts
    Ghost.ts
    HUD.ts
    Input.ts
    Maze.ts
    Player.ts
    Utils.ts
    World.ts
```

## Solucao de problemas

- Porta 5173 ocupada:
  - Rode `npm run dev -- --port 5174`
- Erro de dependencias:
  - Apague `node_modules` e `package-lock.json`, depois rode `npm install`
- Build falhando:
  - Rode `npm run build` e corrija os erros de TypeScript apontados
- Tela preta:
  - Verifique console do navegador (F12)
  - Confirme que a GPU/WebGL esta habilitada no navegador

## Observacoes tecnicas

- Sem CDN e sem assets externos de runtime
- Render com Three.js puro
- Projeto preparado para `dev`, `build` e `preview`
