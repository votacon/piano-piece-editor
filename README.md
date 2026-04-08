# Piano Piece Editor

Editor de partituras musicais no navegador. Crie, edite e reproduza composicoes diretamente no browser, sem backend, sem build tools, sem dependencias locais.

![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-yellow)
![VexFlow](https://img.shields.io/badge/VexFlow-4.2.5-blue)
![Web Audio API](https://img.shields.io/badge/Web%20Audio-API-green)

## Como rodar

Abra `index.html` no navegador. Pronto.

Para um servidor local (recomendado):

```bash
python -m http.server 8000
# Acesse http://localhost:8000
```

## Funcionalidades

### Edicao de notas
- Clique no pentagrama para inserir notas
- Teclas **C D E F G A B** para entrada por teclado
- Duracoes: semibreve, minima, seminima, colcheia, semicolcheia (teclas 1-5)
- Acidentes: sustenido, bemol, bequadro (teclas S, -, N)
- Acordes com Shift+clique ou Shift+letra
- Ligaduras com tecla T
- Pausas com tecla R
- Modo de insercao (tecla I) com cascata de overflow entre compassos

### Navegacao e selecao
- Setas esquerda/direita para navegar entre notas
- Tab para alternar entre clave de sol e clave de fa
- Arrastar para selecionar multiplas notas
- Preview fantasma mostra nome e posicao da nota ao passar o mouse

### Reproducao
- Play/Pause com barra de espaco
- Controle de BPM (20-300)
- Slider de volume
- Barra de progresso com scrubbing (clique para pular)
- Cursor visual acompanha a reproducao
- Dinamicas (pp, p, mp, mf, f, ff) afetam o volume

### Gerenciamento de compassos
- Ctrl+= para adicionar compasso
- Ctrl+- para remover compasso
- Balanceamento automatico com insercao/remocao de pausas

### Arquivos
- Salvar/carregar no localStorage do navegador
- Auto-save a cada 30 segundos
- Exportar/importar como JSON
- Dialogo de nova partitura com titulo, compositor, formula de compasso, tonalidade e BPM

### Edicao
- Undo/Redo (Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z) com historico de 50 estados
- Copiar/Recortar/Colar selecao (Ctrl+C/X/V)

## Atalhos de teclado

| Acao | Atalho |
|------|--------|
| Notas | C, D, E, F, G, A, B |
| Duracao | 1 (semibreve) - 5 (semicolcheia) |
| Acidentes | S (sustenido), - (bemol), N (bequadro) |
| Pausa | R |
| Ligadura | T |
| Inserir antes | I (modo) ou Alt+letra |
| Acorde | Shift+letra |
| Deletar | Delete / Backspace |
| Navegar | Setas esquerda/direita |
| Oitava | Shift+seta cima/baixo |
| Trocar clave | Tab |
| Undo / Redo | Cmd+Z / Cmd+Shift+Z |
| Copiar / Recortar / Colar | Cmd+C / Cmd+X / Cmd+V |
| Play/Pause | Espaco |
| Salvar | Cmd+S |
| Adicionar compasso | Cmd+= |
| Remover compasso | Cmd+- |

## Arquitetura

```
index.html          Ponto de entrada (SPA)
como-usar.html      Guia de uso em portugues

js/
  app.js            Orquestrador — inicializacao, toolbar, atalhos, auto-save
  score-model.js    Modelo de dados — CRUD de notas, compassos, validacao
  renderer.js       Renderizacao — VexFlow → SVG
  editor.js         Interacao — mouse, teclado, selecao, clipboard
  playback.js       Reproducao — Web Audio API, timeline, ADSR
  storage.js        Persistencia — localStorage, export/import JSON
  undo-redo.js      Historico — pilha de snapshots JSON

css/
  style.css         Estilizacao completa (UI escura + area de partitura clara)
```

### Fluxo de dados

```
Input (mouse/teclado)
    → Editor (interpreta acao)
    → Score Model (fonte unica de verdade)
    ├→ Renderer (VexFlow → SVG)
    ├→ Playback (Web Audio API → audio)
    ├→ Storage (localStorage / JSON)
    └→ Undo/Redo (snapshots)
```

## Stack

- **Renderizacao:** [VexFlow 4.2.5](https://www.vexflow.com/) via CDN
- **Audio:** Web Audio API (OscillatorNode + GainNode com envelope ADSR)
- **Persistencia:** localStorage
- **UI:** Vanilla HTML/CSS/JavaScript com ES Modules
- **Build tools:** Nenhum

## Formato de dados

As partituras sao salvas como JSON:

```json
{
  "title": "Minha Musica",
  "composer": "Autor",
  "tempo": 120,
  "timeSignature": { "beats": 4, "beatValue": 4 },
  "keySignature": "C",
  "staves": [
    {
      "clef": "treble",
      "measures": [
        {
          "notes": [
            { "keys": ["c/4"], "duration": "q" },
            { "keys": ["e/4", "g/4"], "duration": "h", "dynamics": "mf" }
          ]
        }
      ]
    },
    {
      "clef": "bass",
      "measures": [...]
    }
  ]
}
```

## Licenca

Uso pessoal.
