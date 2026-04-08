# CLAUDE.md

## Sobre o projeto

Editor de partituras musicais web (SPA). Vanilla JS com ES Modules, sem framework, sem build step. Renderiza notacao musical via VexFlow (CDN) e reproduz audio via Web Audio API. Dados persistidos no localStorage.

## Como rodar

```bash
python -m http.server 8000
# ou simplesmente abrir index.html no navegador
```

Nao ha build, testes automatizados, nem dependencias locais para instalar.

## Estrutura do codigo

```
js/app.js           Orquestrador: init, toolbar, atalhos, auto-save, dialogos
js/score-model.js   Modelo de dados: CRUD de notas/compassos, conversoes de pitch
js/renderer.js      Renderizacao VexFlow → SVG (staves, vozes, beams, ties)
js/editor.js        Interacao: clique, teclado, selecao, drag, clipboard
js/playback.js      Web Audio: timeline, osciladores, ADSR, cursor visual
js/storage.js       localStorage + export/import JSON
js/undo-redo.js     Pilha de snapshots (max 50)
css/style.css       UI escura com area de partitura clara
```

## Convencoes

- ES Modules (`import`/`export`) — sem bundler
- Funcoes exportadas sao pure functions quando possivel; estado vive no objeto `state` em app.js
- Duracoes usam notacao VexFlow: `'w'` (semibreve), `'h'` (minima), `'q'` (seminima), `'8'` (colcheia), `'16'` (semicolcheia)
- Pitches usam formato VexFlow: `"c/4"`, `"fs/5"` (f sustenido, oitava 5)
- Interface bilíngue: código em inglês, UI e docs em português

## Padrao de edicao

Toda edicao segue o fluxo:
1. Modificar `state.score` via funcoes de `score-model.js`
2. Chamar `pushState()` do undo-redo (antes da modificacao, para snapshot)
3. Chamar `renderScore()` para atualizar o SVG
4. Storage auto-save roda a cada 30s

## Pontos de atencao

- VexFlow e carregado via CDN no index.html — nao existe instalacao local
- O `renderer.js` mantem um `noteElementMap` que mapeia elementos SVG → indices (stave, measure, note) para hit-testing de cliques
- Overflow cascade em `insertNoteAt()`: ao inserir nota, excesso transborda para o compasso seguinte
- Playback usa `requestAnimationFrame` para o cursor visual e `AudioContext.currentTime` para scheduling preciso
- Chords sao notas com multiplas keys: `{ keys: ["c/4", "e/4", "g/4"], duration: "q" }`
